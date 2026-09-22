"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FACEBOOK_PAGE_URL,
  mergeSectionNews,
  SECTION_NEWS,
  type NewsItem,
} from "./noticias-data";

type NewsApiResponse = {
  news?: NewsItem[];
  meta?: {
    configured?: boolean;
    webhookConfigured?: boolean;
    lastSuccessAt?: string | null;
    healthy?: boolean;
  };
  sync?: { status?: string } | null;
  radio?: {
    available?: boolean;
    directUrl?: string;
  };
};

const RADIO_STATION_URL = "https://sntss1puebla.radio12345.com/";

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const featured = index === 0;
  return (
    <article
      className={`newsCard${featured ? " featured" : ""}${item.imageUrl ? " withImage" : ""}`}
    >
      {item.imageUrl && (
        <div className="newsCardMedia">
          <img
            src={item.imageUrl}
            alt=""
            loading={featured ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="newsCardDate" aria-hidden="true">
        <strong>{item.day}</strong>
        <span>{item.month}</span>
      </div>
      <div className="newsCardBody">
        <div className="newsCardMeta">
          <span>{item.category}</span>
          <time dateTime={item.dateTime}>{item.date}</time>
        </div>
        <h2>{item.title}</h2>
        <p>{item.summary}</p>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
          Leer publicación original <span aria-hidden="true">↗</span>
        </a>
      </div>
      <span className="newsCardNumber" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
    </article>
  );
}

export function NoticiasPanel() {
  const [news, setNews] = useState<readonly NewsItem[]>(SECTION_NEWS);
  const [connection, setConnection] = useState<
    "checking" | "active" | "partial" | "pending" | "error"
  >("checking");
  const [radioAvailable, setRadioAvailable] = useState(true);
  const [radioDirectUrl, setRadioDirectUrl] = useState(RADIO_STATION_URL);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      try {
        const response = await fetch("/api/news", {
          method: "POST",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const data = (await response.json().catch(() => null)) as NewsApiResponse | null;
        if (!active || !response.ok || !data) throw new Error("news_unavailable");
        if (Array.isArray(data.news)) setNews(mergeSectionNews(data.news));
        if (data.radio) {
          setRadioAvailable(data.radio.available !== false);
          if (/^https?:\/\//i.test(data.radio.directUrl || ""))
            setRadioDirectUrl(data.radio.directUrl || "");
        }
        if (!data.meta?.configured) setConnection("pending");
        else if (data.sync?.status === "error" || data.meta.healthy === false)
          setConnection("error");
        else if (data.meta.webhookConfigured) setConnection("active");
        else setConnection("partial");
      } catch {
        if (active) setConnection("error");
      }
    };
    void synchronize();
    return () => {
      active = false;
    };
  }, []);

  const edition = useMemo(() => {
    const latest = news[0]?.dateTime;
    const date = latest ? new Date(`${latest}T12:00:00Z`) : new Date();
    return {
      month: new Intl.DateTimeFormat("es-MX", { month: "short" })
        .format(date)
        .replace(".", "")
        .toLocaleUpperCase("es-MX"),
      year: String(date.getUTCFullYear()),
    };
  }, [news]);

  const connectionCopy =
    connection === "active"
      ? "Meta conectado · actualización automática activa"
      : connection === "partial"
        ? "Lectura automática activa · webhook pendiente"
        : connection === "pending"
          ? "Edición verificada manualmente · 20 SEP 2026"
          : connection === "error"
            ? "Mostrando la última edición disponible"
            : "Comprobando publicaciones nuevas…";

  return (
    <section className="newsPage" aria-labelledby="news-title">
      <header className="newsHero">
        <div className="newsHeroCopy">
          <span className="newsKicker">SNTSS · SECCIÓN I PUEBLA</span>
          <h1 id="news-title">
            Noticias que mantienen <em>unida e informada</em> a nuestra base.
          </h1>
          <p>
            Actividades, convocatorias y resultados publicados por la Sección I
            Puebla. Cada nota conserva acceso directo a su fuente oficial.
          </p>
          <a
            className="newsFacebookButton"
            href={FACEBOOK_PAGE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Seguir la página en Facebook <span aria-hidden="true">↗</span>
          </a>
          <div className={`newsSyncStatus ${connection}`} aria-live="polite">
            <i aria-hidden="true" />
            {connectionCopy}
          </div>
        </div>
        <aside className="newsEdition" aria-label="Edición de noticias">
          <span>EDICIÓN</span>
          <b>{edition.month}</b>
          <strong>{edition.year}</strong>
          <small>FUENTE OFICIAL · FACEBOOK</small>
        </aside>
      </header>

      {radioAvailable && (
        <section className="newsRadio" aria-label="Radio sindical">
          <div className="newsRadioIdentity">
            <a
              className="newsRadioPlay"
              href={radioDirectUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir Radio SNTSS Puebla en vivo"
            >
              <span aria-hidden="true">▶</span>
            </a>
            <div>
              <span className="newsRadioLive"><i aria-hidden="true" /> EN VIVO</span>
              <b>Radio SNTSS Puebla</b>
              <p>Escucha música mientras lees lo nuevo de tu sindicato.</p>
            </div>
          </div>
          <div className="newsRadioConsole">
            <div className="newsRadioSignal">
              <span>EMISORA OFICIAL</span>
              <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
            </div>
            <a
              className="newsRadioOpen"
              href={radioDirectUrl}
              target="_blank"
              rel="noreferrer"
            >
              Escuchar ahora <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      )}

      <div className="newsTicker" aria-label="Principios editoriales">
        <span>INFORMACIÓN VERIFICADA</span>
        <i aria-hidden="true">◆</i>
        <span>ENLACE A LA FUENTE</span>
        <i aria-hidden="true">◆</i>
        <span>SECCIÓN I PUEBLA</span>
      </div>

      <div className="newsContent">
        <div className="newsSectionHeading">
          <div>
            <span>ACTUALIDAD SINDICAL</span>
            <h2>Lo más reciente de nuestra Sección</h2>
          </div>
          <p>
            Resúmenes informativos basados en publicaciones de la página oficial.
            Consulta el contenido completo directamente en Facebook.
          </p>
        </div>

        <div className="newsGrid">
          {news.map((item, index) => (
            <NewsCard item={item} index={index} key={item.id} />
          ))}
        </div>

        <aside className="newsSourceNote">
          <span aria-hidden="true">f</span>
          <div>
            <b>Fuente editorial: Sección I Puebla en Facebook</b>
            <p>
              Facebook conserva la publicación completa, sus imágenes y cualquier
              actualización posterior. Esta sección muestra un resumen para una
              consulta rápida dentro de la app.
            </p>
          </div>
          <a href={FACEBOOK_PAGE_URL} target="_blank" rel="noreferrer">
            Ver todas las publicaciones
          </a>
        </aside>
      </div>
    </section>
  );
}
