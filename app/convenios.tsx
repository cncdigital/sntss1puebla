import type { ReactNode } from "react";

type ConveniosPanelProps = {
  memberName?: string | null;
  matricula?: string | null;
};

type Agreement = {
  mark: string;
  name: string;
  kind: string;
  benefit: string;
  details: readonly string[];
  sourceUrl?: string;
};

const RECREATION_SOURCE =
  "https://www.facebook.com/SeccionIPuebla/posts/122186338970897054/";

const RECREATION_AGREEMENTS: readonly Agreement[] = [
  {
    mark: "AS",
    name: "Africam Safari",
    kind: "Recreación familiar",
    benefit: "30% de descuento",
    details: ["Acceso al Safari Diurno", "Horario: 10:00 a 17:00 h"],
    sourceUrl: RECREATION_SOURCE,
  },
  {
    mark: "AR",
    name: "Arboterra",
    kind: "Recreación familiar",
    benefit: "10% de descuento",
    details: ["Descuento en el acceso", "Miércoles a lunes · 10:00 a 17:00 h"],
    sourceUrl: RECREATION_SOURCE,
  },
  {
    mark: "RT",
    name: "Rescate Táctico",
    kind: "Entretenimiento",
    benefit: "10% de descuento",
    details: ["Descuento en la sesión de juego", "En horarios de atención al público"],
    sourceUrl: RECREATION_SOURCE,
  },
] as const;

const EDUCATIONAL_AGREEMENTS: readonly Agreement[] = [
  {
    mark: "LHA",
    name: "Lexia Health Academy",
    kind: "Formación en salud",
    benefit: "50% en Expo DMO",
    details: [
      "Para personal activo, pensionado y jubilado del IMSS",
      "Expo Diabetes, Metabolismo y Obesidad",
      "10 y 11 de octubre · Centro de Convenciones Puebla",
      "Promociones exclusivas en formación y actualización",
    ],
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0kFjdvHJSrMxAk5bhs444aVtJvc72ekHFU5cgWFrpE6N36WpJMetos88RtNa9F8kNl",
  },
  {
    mark: "UTR",
    name: "Universidad Tecnológica Roosevelt",
    kind: "Educación",
    benefit: "Becas de hasta 60%",
    details: [
      "Inscripción gratuita",
      "Bachillerato general y tecnológico",
      "Licenciaturas, maestrías y diplomados",
      "Ingeniería en Inteligencia Artificial",
    ],
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122186801354897054/",
  },
  {
    mark: "CEA",
    name: "CEA",
    kind: "Formación académica",
    benefit: "Opciones educativas",
    details: ["Bachillerato", "Licenciatura", "Maestría"],
  },
  {
    mark: "IUMM",
    name: "IUMM",
    kind: "Desarrollo profesional",
    benefit: "Opciones educativas",
    details: ["Bachillerato", "Licenciatura", "Maestría"],
  },
  {
    mark: "CEST",
    name: "CEST",
    kind: "Formación en salud",
    benefit: "Opción educativa",
    details: ["Licenciatura en Medicina"],
  },
] as const;

const ECONOMY_AGREEMENTS: readonly Agreement[] = [
  {
    mark: "CE",
    name: "Cementin",
    kind: "Hogar y construcción",
    benefit: "Descuentos exclusivos",
    details: [
      "Todas las sucursales del estado de Puebla",
      "Atención personalizada",
      "Asesoría desde el pedido hasta la entrega",
      "Requisito: último tarjetón de pago",
    ],
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/videos/4451944348372614/",
  },
  {
    mark: "BYD",
    name: "BYD Cholula",
    kind: "Movilidad",
    benefit: "Precios preferenciales",
    details: [
      "Esquemas de financiamiento",
      "Para personal activo, jubilado y familiares",
      "Tanque lleno en híbridos o carga completa",
      "Cargador de 110 V, tapetes y kit de seguridad",
    ],
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122184047318897054/",
  },
] as const;

function AgreementCard({
  agreement,
  imageSrc,
  index,
}: {
  agreement: Agreement;
  imageSrc: string;
  index: number;
}) {
  return (
    <article className="convenioCard">
      <div className="convenioCardTop">
        <span className="convenioInitials">{agreement.mark}</span>
        <small>{agreement.kind.toLocaleUpperCase("es-MX")}</small>
      </div>
      <div className="convenioThumb" aria-hidden="true">
        <img src={imageSrc} alt="" loading="lazy" decoding="async" />
      </div>
      <div className="convenioCardBody">
        <span className="convenioNumber">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className={agreement.name.length > 20 ? "long" : ""}>
          {agreement.name}
        </h3>
        <p>{agreement.kind}</p>
        <strong className="convenioBenefit">{agreement.benefit}</strong>
        <ul aria-label={`Beneficios de ${agreement.name}`}>
          {agreement.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </div>
      <footer className="convenioCardFoot">
        <span>BENEFICIO SNTSS</span>
        {agreement.sourceUrl ? (
          <a href={agreement.sourceUrl} target="_blank" rel="noreferrer">
            Ver publicación oficial <i aria-hidden="true">↗</i>
          </a>
        ) : (
          <b>FICHA EN ACTUALIZACIÓN</b>
        )}
      </footer>
    </article>
  );
}

function AgreementSection({
  number,
  eyebrow,
  title,
  description,
  imageSrc,
  agreements,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  agreements: readonly Agreement[];
  children?: ReactNode;
}) {
  return (
    <section className="conveniosGroup" aria-labelledby={`convenios-group-${number}`}>
      <div className="conveniosHeading">
        <span>{number}</span>
        <div>
          <small>{eyebrow}</small>
          <h2 id={`convenios-group-${number}`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="conveniosGrid">
        {agreements.map((agreement, index) => (
          <AgreementCard
            agreement={agreement}
            imageSrc={imageSrc}
            index={index}
            key={agreement.name}
          />
        ))}
      </div>
      {children}
    </section>
  );
}

export function ConveniosPanel({ memberName, matricula }: ConveniosPanelProps) {
  return (
    <section className="conveniosPage" aria-labelledby="convenios-title">
      <header className="conveniosHero">
        <div className="conveniosHeroCopy">
          <span className="conveniosKicker">ACUERDOS Y CONVENIOS SNTSS · SECCIÓN I PUEBLA</span>
          <h1 id="convenios-title">
            Ser sindicalizado se traduce en <em>más oportunidades.</em>
          </h1>
          <p>
            Al formar parte del Sindicato Nacional de Trabajadores del Seguro
            Social, cuentas con beneficios creados para impulsar tu bienestar,
            tu desarrollo profesional y el de tu familia.
          </p>
          <div className="conveniosHighlights" aria-label="Alcance de los convenios">
            <span>✓ Beneficios sindicales</span>
            <span>✓ Oportunidades para tu familia</span>
            <span>✓ Información clara y centralizada</span>
          </div>
          {(memberName || matricula) && (
            <div className="conveniosMember">
              <span aria-hidden="true">✓</span>
              <div>
                <small>ACCESO PARA PERSONAL SINDICALIZADO</small>
                <b>{memberName || `Matrícula ${matricula}`}</b>
                {memberName && matricula && <p>Matrícula {matricula}</p>}
              </div>
            </div>
          )}
        </div>
        <aside className="conveniosSeal" aria-label="Beneficio sindical SNTSS">
          <span>BENEFICIO</span>
          <b>SNTSS</b>
          <small>SECCIÓN I PUEBLA</small>
          <i>PARA TI Y TU FAMILIA</i>
        </aside>
      </header>

      <div className="conveniosContent">
        <AgreementSection
          number="01"
          eyebrow="CULTURA, RECREACIÓN Y TURISMO"
          title="Experiencias para disfrutar en familia"
          description="Descuentos publicados por la Sección I Puebla para fortalecer la convivencia y el bienestar familiar."
          imageSrc="/convenios-recreacion.webp"
          agreements={RECREATION_AGREEMENTS}
        >
          <div className="conveniosRequirements">
            <b>¿Cómo hacerlos válidos?</b>
            <p>
              Presenta credencial vigente del IMSS o último tarjetón de pago e
              INE. Aplica para personal activo o jubilado y hasta tres
              acompañantes.
            </p>
          </div>
        </AgreementSection>

        <AgreementSection
          number="02"
          eyebrow="PREPARACIÓN Y CRECIMIENTO"
          title="Convenios educativos"
          description="Alternativas para seguir estudiando, fortalecer tu perfil profesional y abrir nuevas oportunidades para tu familia."
          imageSrc="/convenios-educacion.webp"
          agreements={EDUCATIONAL_AGREEMENTS}
        />

        <AgreementSection
          number="03"
          eyebrow="PROTECCIÓN AL SALARIO"
          title="Economía, hogar y movilidad"
          description="Alianzas que acercan atención preferencial y mejores condiciones de compra a la base trabajadora."
          imageSrc="/convenios-economia.webp"
          agreements={ECONOMY_AGREEMENTS}
        />

        <section className="conveniosNotice" aria-labelledby="convenios-notice-title">
          <div>
            <span>INFORMACIÓN IMPORTANTE</span>
            <h2 id="convenios-notice-title">Beneficios con reglas claras.</h2>
          </div>
          <p>
            Los descuentos pueden estar sujetos a vigencia, disponibilidad y
            condiciones de cada establecimiento. Confirma la promoción antes
            de comprar y presenta únicamente los documentos señalados en la
            publicación oficial. Información revisada manualmente el 22 de
            septiembre de 2026. Se mantienen los convenios con condiciones
            verificables, incluido Lexia Health Academy, y no se agregan
            beneficios sin una fuente oficial vigente.
          </p>
        </section>

        <section className="conveniosNext" aria-label="Próximos convenios">
          <span aria-hidden="true">+</span>
          <div>
            <small>ACTUALIZACIÓN CONTINUA</small>
            <h2>Más alianzas, más valor para nuestra base trabajadora.</h2>
            <p>
              Incorporaremos nuevos convenios conforme se publiquen sus
              beneficios, requisitos y vigencia oficiales.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
