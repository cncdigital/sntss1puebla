import type { Metadata } from "next";
import Home from "../page";

export const metadata: Metadata = {
  alternates: { canonical: "/credenciales" },
  title: "Credenciales SNTSS1Puebla",
  description:
    "Plataforma de identidad digital sindical para trabajadores IMSS y sus beneficiarios.",
  openGraph: {
    url: "/credenciales",
    title: "Credenciales SNTSS1Puebla",
    description:
      "Registro, validación y consulta de la credencial digital sindical de la Sección I Puebla.",
  },
  twitter: {
    title: "Credenciales SNTSS1Puebla",
    description:
      "Registro, validación y consulta de la credencial digital sindical de la Sección I Puebla.",
  },
};

export default Home;
