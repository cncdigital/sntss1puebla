"use client";

import { useState } from "react";
import directory from "./devi/directory.generated.json";
import { FACEBOOK_PAGE_URL, SECTION_NEWS } from "./noticias-data";
import {
  COMMITTEE_COMMISSIONS,
  COMMITTEE_SUBCOMMISSIONS,
  type CommitteeGroup,
} from "./official-committee-data";

type OfficialHomeProps = {
  signedIn: boolean;
  memberName?: string | null;
  onAccess: () => void;
  onCredentials: () => void;
  onNews: () => void;
  onAgreements: () => void;
  onDevi: () => void;
  onTools: () => void;
};

const SERVICES = [
  {
    number: "01",
    title: "Credencial sindical digital",
    text: "Identificación segura para la persona trabajadora y sus beneficiarios, con expediente validado y código QR.",
    action: "Abrir Credenciales",
    key: "credentials",
  },
  {
    number: "02",
    title: "DeVi · Delegada Virtual",
    text: "Orientación con base en el CCT, Estatutos, normatividad y directorio de la Sección I Puebla.",
    action: "Consultar a DeVi",
    key: "devi",
  },
  {
    number: "03",
    title: "Noticias y convenios",
    text: "Información sindical, beneficios, formación, recreación y acuerdos disponibles para nuestra base trabajadora.",
    action: "Ver convenios",
    key: "agreements",
  },
  {
    number: "04",
    title: "Centro del trabajador",
    text: "Calculadora de vacaciones con sueldo quincenal, sin guardar datos personales.",
    action: "Abrir herramientas",
    key: "tools",
  },
] as const;

const SECTIONAL_COMMITTEE = [
  { role: "Secretaria General", name: "María Elena López de la Vega" },
  { role: "Secretaria del Interior y Propaganda", name: "Elda Isela Cuesta Olmedo" },
  { role: "Secretario de Conflictos", name: "Emilio Ventura Martínez" },
  { role: "Secretaria del Trabajo", name: "Margarita Carrillo Sánchez" },
  { role: "Secretario del Exterior", name: "Eduardo César Haro Paredes" },
  { role: "Secretario Tesorero", name: "Christian Nieto Cordero" },
  { role: "Secretaria de Previsión Social", name: "Janiece del Rocío Pacheco Leiva" },
  { role: "Secretaria de Igualdad Sustantiva", name: "Alicia Maldonado Lezama" },
  { role: "Secretario de Asuntos Técnicos", name: "Gerardo Gamez Herrera" },
  { role: "Secretaria de Actas y Acuerdos", name: "Fabiola Velazco Rojas" },
  { role: "Secretaria de Prensa", name: "Yuli Pérez Carrillo" },
  { role: "Secretario de Puestos Periféricos", name: "Jorge Cerón Rosales" },
  { role: "Secretario de Admisión y Cambios", name: "Aldo Héctor Martínez López" },
  { role: "Secretario de Capacitación y Adiestramiento", name: "Rafaél Cuevas Falcón" },
  { role: "Secretario de Acción Social", name: "Milton Yair Calzada Flores" },
  { role: "Secretaria de Calidad y Modernización", name: "Erika Amador Rodríguez" },
  { role: "Secretaria de Fomento a la Habitación", name: "Luz del Carmen Flores Márquez" },
] as const;

const DIRECTORY_PHONE_BY_NAME = new Map(
  directory.contacts.map((contact) => [
    contact.name,
    contact.phone.replace(/\D/g, ""),
  ]),
);

function whatsAppHref(name: string) {
  const phone = DIRECTORY_PHONE_BY_NAME.get(name);
  if (!phone) return null;
  return `https://wa.me/${phone.length === 10 ? `52${phone}` : phone}`;
}

function CommitteeMemberName({ name }: { name: string }) {
  const href = whatsAppHref(name);
  if (!href) return <>{name}</>;

  return (
    <a
      className="officialCommitteeWhatsApp"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Contactar por WhatsApp a ${name}`}
    >
      <span>{name}</span>
      <i aria-hidden="true">WhatsApp ↗</i>
    </a>
  );
}

function CommitteeGroups({
  groups,
  kind,
}: {
  groups: readonly CommitteeGroup[];
  kind: "commission" | "subcommission";
}) {
  return (
    <div className={`officialCommitteeGroups ${kind}`}>
      {groups.map((group) => (
        <article className="officialCommitteeGroup" key={group.area}>
          <h4>{group.area}</h4>
          <ul>
            {group.members.map((member) => (
              <li key={`${group.area}-${member.role}-${member.name}`}>
                <small>{member.role}</small>
                <b><CommitteeMemberName name={member.name} /></b>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export function OfficialHome({
  signedIn,
  memberName,
  onAccess,
  onCredentials,
  onNews,
  onAgreements,
  onDevi,
  onTools,
}: OfficialHomeProps) {
  const [showCommittee, setShowCommittee] = useState(false);

  const runAction = (key: (typeof SERVICES)[number]["key"]) => {
    if (key === "credentials") onCredentials();
    else if (key === "devi") onDevi();
    else if (key === "tools") onTools();
    else onAgreements();
  };

  const openCommittee = () => {
    setShowCommittee(true);
    window.requestAnimationFrame(() => {
      document.getElementById("committee-directory")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div className="officialHome">
      <section className="officialHero" aria-labelledby="official-title">
        <div className="officialHeroCopy">
          <span className="officialKicker">SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL</span>
          <h1 id="official-title">
            Sección I Puebla
            <em>Unidad que protege. Trabajo que transforma.</em>
          </h1>
          <p>
            Información, servicios y atención sindical en un solo lugar para las
            trabajadoras y los trabajadores del IMSS en Puebla.
          </p>
          {signedIn && memberName ? (
            <div className="officialWelcome">
              <span aria-hidden="true">✓</span>
              <p><b>Bienvenido, {memberName}.</b> Tu sesión del portal también funciona en Credenciales.</p>
            </div>
          ) : null}
          <div className="officialHeroActions">
            <button className="officialPrimary" type="button" onClick={signedIn ? onCredentials : onAccess}>
              {signedIn ? "Ir a mi credencial" : "Entrar o registrarme"}
              <span aria-hidden="true">→</span>
            </button>
            <button className="officialSecondary" type="button" onClick={onNews}>
              Ver noticias
            </button>
          </div>
          <small className="officialSingleAccount">
            Una sola cuenta para el portal, Credenciales, DeVi y los servicios autorizados.
          </small>
        </div>
        <div className="officialHeroMark" aria-label="SNTSS Sección I Puebla">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icon-512.png" alt="Emblema del SNTSS Sección I Puebla" />
          <div>
            <span>SECCIÓN I</span>
            <b>PUEBLA</b>
            <small>TODOS JUNTOS TODOS FUERTES</small>
          </div>
        </div>
      </section>

      <section className="officialLeadership" aria-labelledby="leadership-title">
        <span className="officialLeadershipRule" aria-hidden="true" />
        <div>
          <button
            className="officialCommitteeTrigger"
            type="button"
            aria-controls="committee-directory"
            aria-expanded={showCommittee}
            onClick={openCommittee}
          >
            <span>COMITÉ EJECUTIVO SECCIONAL 2025–2031</span>
            <b>Ver directorio</b>
            <i aria-hidden="true">→</i>
          </button>
          <h2 id="leadership-title">C.B. María Elena López de la Vega</h2>
          <p>Secretaria General de la Sección I Puebla</p>
        </div>
        <blockquote>“Bienestar laboral y un sindicato para todos.”</blockquote>
      </section>

      {showCommittee ? (
        <section
          className="officialCommitteeDirectory"
          id="committee-directory"
          aria-labelledby="committee-directory-title"
        >
          <header>
            <div>
              <span>DIRECTORIO OFICIAL · PERIODO 2025–2031</span>
              <h2 id="committee-directory-title">Directorio completo de la Sección I Puebla</h2>
              <p>Consulta todas las Secretarías, Comisiones y Subcomisiones con sus cargos y nombres.</p>
            </div>
            <button type="button" onClick={() => setShowCommittee(false)}>
              Cerrar directorio <span aria-hidden="true">×</span>
            </button>
          </header>
          <nav className="officialDirectoryIndex" aria-label="Secciones del directorio">
            <a href="#secretariats-title"><b>{SECTIONAL_COMMITTEE.length}</b><span>Secretarías</span></a>
            <a href="#commissions-title"><b>{COMMITTEE_COMMISSIONS.length}</b><span>Comisiones</span></a>
            <a href="#subcommissions-title"><b>{COMMITTEE_SUBCOMMISSIONS.length}</b><span>Subcomisiones</span></a>
          </nav>
          <section className="officialCommitteeDivision secretariats" aria-labelledby="secretariats-title">
            <header>
              <span>{String(SECTIONAL_COMMITTEE.length).padStart(2, "0")} SECRETARÍAS</span>
              <h3 id="secretariats-title">Secretarías del Comité Ejecutivo Seccional</h3>
            </header>
            <ol className="officialCommitteeList">
              {SECTIONAL_COMMITTEE.map((member, index) => (
                <li key={member.role} className={index === 0 ? "general" : undefined}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{member.role}</small>
                    <h3><CommitteeMemberName name={member.name} /></h3>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="officialCommitteeDivision" aria-labelledby="commissions-title">
            <header>
              <span>06 COMISIONES</span>
              <h3 id="commissions-title">Comisiones seccionales</h3>
            </header>
            <CommitteeGroups groups={COMMITTEE_COMMISSIONS} kind="commission" />
          </section>
          <section className="officialCommitteeDivision" aria-labelledby="subcommissions-title">
            <header>
              <span>16 SUBCOMISIONES</span>
              <h3 id="subcommissions-title">Subcomisiones seccionales</h3>
            </header>
            <CommitteeGroups groups={COMMITTEE_SUBCOMMISSIONS} kind="subcommission" />
          </section>
        </section>
      ) : null}

      <section className="officialServices" aria-labelledby="services-title">
        <header className="officialSectionHeading">
          <span>SERVICIOS DIGITALES</span>
          <h2 id="services-title">Tu sindicato, más cerca y más ágil</h2>
          <p>La misma identidad sindical conecta cada servicio sin duplicar registros ni contraseñas.</p>
        </header>
        <div className="officialServiceGrid">
          {SERVICES.map((service) => (
            <article key={service.number} className="officialServiceCard">
              <span>{service.number}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
              <button type="button" onClick={() => runAction(service.key)}>
                {service.action} <i aria-hidden="true">↗</i>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="officialNewsPreview" aria-labelledby="news-preview-title">
        <header className="officialSectionHeading light">
          <span>ACTUALIDAD SINDICAL</span>
          <h2 id="news-preview-title">Información que sí te sirve</h2>
          <p>Acuerdos, actividades y resultados de la Sección I Puebla.</p>
        </header>
        <div className="officialNewsGrid">
          {SECTION_NEWS.slice(0, 3).map((item, index) => (
            <article key={item.id} className={index === 0 ? "featured" : ""}>
              <div className="officialNewsDate">
                <b>{item.day}</b><span>{item.month}</span>
              </div>
              <div>
                <small>{item.category}</small>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">Ver publicación oficial ↗</a>
              </div>
            </article>
          ))}
        </div>
        <div className="officialNewsActions">
          <button type="button" onClick={onNews}>Todas las noticias</button>
          <a href={FACEBOOK_PAGE_URL} target="_blank" rel="noreferrer">Facebook Sección I Puebla ↗</a>
        </div>
      </section>

      <section className="officialAccessBand" aria-labelledby="access-band-title">
        <div>
          <span>ECOSISTEMA SNTSS1PUEBLA</span>
          <h2 id="access-band-title">Un registro. Una sesión. Todos tus servicios.</h2>
          <p>
            La información de Credenciales alimenta el portal de forma segura. Tu matrícula,
            cuenta y permisos se reconocen en todo el sistema.
          </p>
        </div>
        <button type="button" onClick={signedIn ? onCredentials : onAccess}>
          {signedIn ? "Abrir mi espacio" : "Crear mi cuenta"} <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}
