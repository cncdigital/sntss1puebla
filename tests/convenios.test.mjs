import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Convenios is available to authenticated union members", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const panel = readFileSync("app/convenios.tsx", "utf8");

  assert.match(page, /"convenios"/);
  assert.match(page, />Convenios<\/button>/);
  assert.match(page, /<ConveniosPanel/);
  assert.match(panel, /Ser sindicalizado se traduce en/);
  assert.match(panel, /Sindicato Nacional de Trabajadores del Seguro\s+Social/);
});

test("Convenios presents the confirmed agreements and their published scope", () => {
  const panel = readFileSync("app/convenios.tsx", "utf8");
  const styles = readFileSync("app/convenios.css", "utf8");

  for (const agreement of [
    "Africam Safari",
    "Arboterra",
    "Rescate Táctico",
    "Universidad Tecnológica Roosevelt",
    "Lexia Health Academy",
    "CEA",
    "IUMM",
    "CEST",
    "Cementin",
    "BYD Cholula",
  ]) {
    assert.match(panel, new RegExp(agreement));
  }
  assert.match(panel, /30% de descuento/);
  assert.match(panel, /Becas de hasta 60%/);
  assert.match(panel, /50% en Expo DMO/);
  assert.match(panel, /10 y 11 de octubre/);
  assert.match(panel, /hasta tres/);
  assert.match(panel, /publicación oficial/);
  assert.match(styles, /@media \(max-width: 480px\)/);
});

test("Convenios uses lightweight category imagery on every benefit card", () => {
  const panel = readFileSync("app/convenios.tsx", "utf8");
  const styles = readFileSync("app/convenios.css", "utf8");

  for (const image of [
    "/convenios-recreacion.webp",
    "/convenios-educacion.webp",
    "/convenios-economia.webp",
  ]) {
    assert.match(panel, new RegExp(image));
  }
  assert.match(panel, /className="convenioThumb"/);
  assert.match(panel, /loading="lazy"/);
  assert.match(styles, /\.convenioThumb \{/);
  assert.match(styles, /object-fit: cover/);
});
