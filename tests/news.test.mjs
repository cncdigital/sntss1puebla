import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mergeSectionNews,
  SECTION_NEWS,
} from "../app/noticias-data.ts";
import {
  facebookNewsCategory,
  facebookNewsCopy,
  facebookPostToNews,
} from "../app/facebook-news.ts";

test("the public official portal can open the Sección I Puebla news section", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  const panel = readFileSync("app/noticias.tsx", "utf8");
  const data = readFileSync("app/noticias-data.ts", "utf8");
  const styles = readFileSync("app/noticias.css", "utf8");

  assert.match(page, /"noticias"/);
  assert.match(page, />Noticias<\/button>/);
  assert.match(page, /<NoticiasPanel/);
  assert.match(page, /const canViewNews = true/);
  assert.match(layout, /import "\.\/noticias\.css"/);
  assert.match(data, /https:\/\/www\.facebook\.com\/SeccionIPuebla\//);
  assert.match(panel, /Leer publicación original/);
  assert.match(panel, /FUENTE OFICIAL · FACEBOOK/);
  assert.match(styles, /\.newsPage/);
  assert.match(styles, /@media \(max-width: 470px\)/);
});

test("news cards preserve dates, categories and direct Facebook sources", () => {
  assert.ok(SECTION_NEWS.length >= 13);
  assert.ok(
    SECTION_NEWS.filter((item) => item.dateTime >= "2026-09-01").length >= 7,
    "the verified editorial fallback should include several recent September posts",
  );
  assert.equal(new Set(SECTION_NEWS.map((item) => item.id)).size, SECTION_NEWS.length);
  assert.equal(SECTION_NEWS.filter((item) => item.featured).length, 1);
  for (const item of SECTION_NEWS) {
    assert.match(item.dateTime, /^2026-\d{2}-\d{2}$/);
    assert.ok(item.category.length > 3);
    assert.ok(item.title.length > 10);
    assert.ok(item.summary.length > 40);
    assert.match(item.sourceUrl, /^https:\/\/www\.facebook\.com\/SeccionIPuebla\//);
  }
});

test("manual verified news remains visible when Facebook returns older items", () => {
  const merged = mergeSectionNews([
    {
      id: "facebook-older",
      date: "10 de agosto de 2026",
      dateTime: "2026-08-10",
      day: "10",
      month: "AGO",
      category: "VIDA SINDICAL",
      title: "Publicación sincronizada de prueba",
      summary: "Contenido suficiente para comprobar que la noticia dinámica se conserva.",
      sourceUrl: "https://www.facebook.com/SeccionIPuebla/posts/older/",
      origin: "facebook",
    },
  ]);

  assert.equal(merged[0].id, "la-voz-resiliencia-2026-09-20");
  assert.ok(merged.some((item) => item.id === "facebook-older"));
  assert.equal(merged.filter((item) => item.featured).length, 1);
});

test("Facebook posts become concise news without inventing their source", () => {
  assert.equal(
    facebookNewsCategory("PREVENIMSS y vacunación para nuestra base"),
    "SALUD Y BIENESTAR",
  );
  const copy = facebookNewsCopy(
    "📢 CAPACITACIÓN QUE FORTALECE NUESTRA LABOR\nLa Sección I Puebla participó en una jornada de actualización sindical.",
  );
  assert.equal(copy.title, "CAPACITACIÓN QUE FORTALECE NUESTRA LABOR");
  assert.match(copy.summary, /jornada de actualización sindical/);

  const item = facebookPostToNews(
    {
      id: "100076013960323_123456789",
      message: "REUNIÓN GTAP\nAtención bilateral de temas prioritarios.",
      created_time: "2026-08-30T03:00:00+0000",
      permalink_url:
        "https://www.facebook.com/SeccionIPuebla/posts/123456789/",
      from: { id: "100076013960323", name: "Sección I Puebla" },
    },
    "100076013960323",
  );
  assert.ok(item);
  assert.equal(item.category, "GESTIÓN BILATERAL");
  assert.equal(item.facebookPostId, "100076013960323_123456789");
  assert.match(item.permalinkUrl, /^https:\/\/www\.facebook\.com\//);
  assert.equal(
    facebookPostToNews(
      { id: "999_123", from: { id: "999" } },
      "100076013960323",
    ),
    null,
  );
});

test("Meta synchronization is server-side, signed, deduplicated and backed by D1", () => {
  const meta = readFileSync("app/api/news/meta.ts", "utf8");
  const newsRoute = readFileSync("app/api/news/route.ts", "utf8");
  const webhook = readFileSync("app/api/meta/webhook/route.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync("drizzle/0024_noticias_facebook.sql", "utf8");
  const environment = readFileSync(".env.example", "utf8");

  assert.match(meta, /META_PAGE_ACCESS_TOKEN/);
  assert.match(meta, /published_posts/);
  assert.match(meta, /authorization: `Bearer \$\{metaNewsConfiguration\(\)\.pageAccessToken\}`/);
  assert.doesNotMatch(meta, /searchParams\.set\("access_token"/);
  assert.match(meta, /SYNC_MIN_INTERVAL_MS/);
  assert.match(meta, /ON CONFLICT\(facebook_post_id\) DO UPDATE/);
  assert.match(
    meta,
    /upsertStatement\(record, !initialBackfill, "page-sync"\)/,
  );
  assert.match(meta, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /verifyFacebookWebhookChallenge/);
  assert.match(newsRoute, /getWorkerSession\(request\)/);
  assert.match(newsRoute, /getPrivilege\(request\)/);
  assert.match(newsRoute, /syncFacebookNews\(\)/);
  assert.match(schema, /"facebook_news"/);
  assert.match(migration, /CREATE UNIQUE INDEX `facebook_news_facebook_post_id_unique`/);
  assert.match(environment, /META_GRAPH_API_VERSION=v26\.0/);
  assert.match(environment, /META_WEBHOOK_VERIFY_TOKEN=/);
  assert.doesNotMatch(environment, /NEXT_PUBLIC_META/);
});

test("the News screen checks Meta automatically and keeps its verified fallback", () => {
  const panel = readFileSync("app/noticias.tsx", "utf8");
  const styles = readFileSync("app/noticias.css", "utf8");
  assert.match(panel, /fetch\("\/api\/news"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /Meta conectado · actualización automática activa/);
  assert.match(panel, /setNews\(mergeSectionNews\(data\.news\)\)/);
  assert.match(panel, /SECTION_NEWS/);
  assert.match(panel, /item\.imageUrl/);
  assert.match(styles, /\.newsSyncStatus\.active/);
  assert.match(styles, /\.newsCardMedia/);
});

test("administrators can force a Facebook news sync and update the radio", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const panel = readFileSync("app/news-admin.tsx", "utf8");
  const route = readFileSync("app/api/admin/news/route.ts", "utf8");
  const meta = readFileSync("app/api/news/meta.ts", "utf8");

  assert.match(page, />Noticias y radio<\/button>/);
  assert.match(page, /tab === "noticias" && privilege\.canAdmin/);
  assert.match(panel, /Sincronizar noticias de Facebook/);
  assert.match(panel, /Guardar dirección de radio/);
  assert.match(route, /requirePrivilege\(request, "admin"\)/);
  assert.match(route, /syncFacebookNews\(\{ force: true \}\)/);
  assert.match(route, /news_radio\.url_updated/);
  assert.match(meta, /!options\.force/);
});

test("the News screen opens the provider-authorized station page", () => {
  const panel = readFileSync("app/noticias.tsx", "utf8");
  const publicRoute = readFileSync("app/api/news/route.ts", "utf8");
  const radioRoute = readFileSync("app/api/news/radio/route.ts", "utf8");
  const settings = readFileSync("app/api/news/radio-settings.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const styles = readFileSync("app/noticias.css", "utf8");

  assert.doesNotMatch(panel, /<audio/);
  assert.match(panel, /Radio SNTSS Puebla/);
  assert.match(panel, /EN VIVO/);
  assert.match(panel, /EMISORA OFICIAL/);
  assert.match(panel, /Escucha música mientras lees lo nuevo de tu sindicato\./);
  assert.match(panel, /href=\{radioDirectUrl\}/);
  assert.match(panel, /sntss1puebla\.radio12345\.com/);
  assert.doesNotMatch(panel, /src="http:\/\/78\.129\.252\.13:26059/);
  assert.match(publicRoute, /streamPath: "\/api\/news\/radio"/);
  assert.match(radioRoute, /getWorkerSession\(request\)/);
  assert.match(radioRoute, /getPrivilege\(request\)/);
  assert.match(radioRoute, /redirect: "manual"/);
  assert.match(radioRoute, /uk6freenew\.listen2myradio\.com/);
  assert.match(radioRoute, /typeportmount=s1_/);
  assert.match(radioRoute, /typeportmount=ice_/);
  assert.match(radioRoute, /uk6freenew\.listen2myradio\.com:26059\//);
  assert.match(radioRoute, /78\.129\.252\.13:26059\//);
  assert.match(radioRoute, /rawContinuousStream/);
  assert.match(radioRoute, /"audio\/mpeg"/);
  assert.match(radioRoute, /"icy-metadata": "1"/);
  assert.doesNotMatch(radioRoute, /headers\.set\("range"/);
  assert.match(settings, /s1_26059_stream_466575438/);
  assert.match(settings, /sntss1puebla\.radio12345\.com/);
  assert.match(settings, /blockedHostname/);
  assert.match(schema, /"news_settings"/);
  assert.match(styles, /\.newsRadio/);
  assert.match(panel, /Escuchar ahora/);
});
