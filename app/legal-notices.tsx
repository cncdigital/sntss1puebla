"use client";

import {
  CONSENT_RECORD_VERSION,
  DATA_CONTROLLER_ADDRESS,
  DATA_CONTROLLER_LEGAL_NAME,
  DATA_CONTROLLER_RFC,
  DATA_PROTECTION_EMAIL,
  GENERAL_TERMS_VERSION,
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_NOTICE_VERSION,
} from "./legal-config";

export type LegalDocument = "privacy" | "terms";

function PrivacyNotice() {
  return (
    <article className="legalDocument">
      <header className="legalDocumentLead">
        <span>AVISO DE PRIVACIDAD INTEGRAL</span>
        <h2>Credenciales SNTSS1Puebla y servicios QR</h2>
        <p>Versión {PRIVACY_NOTICE_VERSION} · vigente desde el {LEGAL_EFFECTIVE_DATE}</p>
      </header>

      <section>
        <h3>1. Responsable y contacto</h3>
        <p>Para todos los efectos de este aviso, la persona moral responsable del tratamiento es:</p>
        <dl className="legalIdentity">
          <div><dt>Razón social</dt><dd>{DATA_CONTROLLER_LEGAL_NAME}</dd></div>
          <div><dt>RFC</dt><dd>{DATA_CONTROLLER_RFC}</dd></div>
          <div><dt>Domicilio fiscal y legal</dt><dd>{DATA_CONTROLLER_ADDRESS}.</dd></div>
          <div><dt>Área de datos personales</dt><dd>Unidad de Transparencia y Protección de Datos Personales de la Sección 1 Puebla</dd></div>
          <div><dt>Correo oficial</dt><dd><a href={`mailto:${DATA_PROTECTION_EMAIL}`}>{DATA_PROTECTION_EMAIL}</a></dd></div>
        </dl>
        <p>Las solicitudes ARCO, de limitación, revocación, aclaración o copia del consentimiento podrán presentarse por correo electrónico o por escrito en el domicilio señalado, dirigidas al área de datos personales.</p>
      </section>

      <section>
        <h3>2. Datos personales tratados</h3>
        <p>Dependiendo del trámite, se tratarán las siguientes categorías:</p>
        <ul>
          <li><b>Identificación y afiliación:</b> nombre, matrícula, CURP, RFC, NSS, categoría, adscripción o unidad, fotografía, INE, tarjetón y folio.</li>
          <li><b>Contacto:</b> correo electrónico y teléfono.</li>
          <li><b>Beneficiarios:</b> nombre, parentesco, CURP, fotografía y documento que acredita el parentesco o la representación. Estos datos pueden corresponder a menores de edad.</li>
          <li><b>Credencial y operación:</b> token y código QR, estado y vigencia, accesos, entradas y salidas, eventos, acompañantes, folios, becas, nivel de estudios, calificación y monto.</li>
          <li><b>Seguridad y soporte:</b> método de acceso, correo confirmado por el proveedor de identidad cuando se elige Google, correo proporcionado en el registro alternativo, estado y revisión de esa solicitud, sesiones autenticadas, intentos fallidos, bloqueos temporales, roles, fechas y horas, metadatos de archivos y bitácoras de acciones administrativas. La plataforma no recibe ni guarda la contraseña de Google.</li>
        </ul>
        <p><b>Datos que serán tratados como sensibles:</b> afiliación sindical; fotografías e imágenes de documentos cuando permitan identificar de forma reforzada a la persona; y cualquier dato de salud, religión, opiniones políticas, información genética, preferencias sexuales u otra información íntima que aparezca incidentalmente en los documentos. No se utiliza reconocimiento biométrico automatizado.</p>
        <p>El tratamiento de datos sensibles se limitará al mínimo indispensable, con acceso restringido y únicamente para las finalidades expresamente informadas.</p>
      </section>

      <section>
        <h3>3. Finalidades necesarias</h3>
        <ul>
          <li>Verificar la pertenencia al padrón, la identidad y el parentesco o representación de beneficiarios.</li>
          <li>Integrar, revisar, corregir y conservar el expediente; emitir, mostrar, validar, imprimir o revocar credenciales y códigos QR.</li>
          <li>Autenticar usuarios mediante Google, correo y CURP o contraseña personal; vincular la identidad con la matrícula; administrar permisos; prevenir duplicidades, suplantaciones, fraude y uso no autorizado.</li>
          <li>Recibir y revisar solicitudes de acceso sin Google; validar CURP, tarjetón e INE contra el padrón; incorporar los documentos aprobados al expediente de credencial y comunicar el resultado al correo proporcionado.</li>
          <li>Registrar accesos, eventos, acompañantes, rifas y pagos o apoyos de Becas Sinabeth, conforme a las reglas de cada campaña.</li>
          <li>Atender aclaraciones, soporte, auditorías, incidentes de seguridad y obligaciones legales o sindicales aplicables.</li>
          <li>Generar estadísticas operativas y financieras. Cuando sea posible, se presentarán de forma agregada.</li>
        </ul>
        <p>Estas finalidades son necesarias para prestar el servicio. No se utilizan los datos para publicidad, prospección comercial ni venta de información. Si en el futuro se incorpora una finalidad secundaria, se informará y se solicitará una decisión separada antes de usar los datos para ella.</p>
      </section>

      <section>
        <h3>4. Consentimiento y datos de terceros</h3>
        <p>Las casillas no aparecen preseleccionadas. El envío ordinario se realiza desde una sesión vinculada con la matrícula. Cuando todavía no existe acceso, el registro alternativo se vincula con una matrícula del padrón activo y queda sujeto a revisión humana de CURP, tarjetón e INE antes de habilitar la cuenta. La selección voluntaria de las casillas, el canal utilizado, el folio o expediente, la fecha del servidor y las versiones {PRIVACY_NOTICE_VERSION}, {GENERAL_TERMS_VERSION} y {CONSENT_RECORD_VERSION} forman el registro electrónico del consentimiento.</p>
        <p>Para datos sensibles se solicita consentimiento expreso y por escrito mediante este mecanismo electrónico; en el registro alternativo la identidad deberá confirmarse documentalmente por personal autorizado antes de dar acceso. Esto se realiza conforme a los artículos 7 y 8 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. La persona titular puede solicitar copia de su constancia de aceptación en <a href={`mailto:${DATA_PROTECTION_EMAIL}`}>{DATA_PROTECTION_EMAIL}</a>.</p>
        <p>Quien proporcione datos de beneficiarios declara bajo protesta de decir verdad que cuenta con su autorización o con patria potestad, tutela o representación suficiente. Si se trata de una persona menor de edad, quien registra deberá actuar en su interés superior; cuando el beneficiario pueda consentir por sí mismo, deberá recibir este aviso antes de proporcionar sus datos.</p>
      </section>

      <section>
        <h3>5. Transferencias y encargados</h3>
        <p>El SNTSS no vende ni renta datos personales. El personal nacional, seccional o autorizado podrá acceder solamente cuando sea necesario para el trámite. Los proveedores de infraestructura, almacenamiento, autenticación y seguridad tratarán datos por cuenta del responsable, bajo instrucciones y deberes de confidencialidad. Si la persona elige Google, la autenticación se realiza en la pantalla protegida del proveedor y la plataforma recibe únicamente los datos de identidad indispensables para confirmar el correo. La conexión documental con Google solicita únicamente acceso a los archivos creados por la aplicación. Cuando el revisor decide avisar por correo, la plataforma prepara el mensaje y lo entrega a la aplicación de correo elegida por el revisor para que éste confirme el envío.</p>
        <p>Podrán realizarse transferencias al IMSS, instituciones educativas o autoridades competentes cuando sean necesarias para gestionar el beneficio solicitado, cumplir una obligación legal, atender un mandato fundado o defender derechos. La plataforma no envía automáticamente expedientes al IMSS ni a instituciones educativas.</p>
        <p>Cuando una transferencia requiera consentimiento, antes de realizarla se mostrará una cláusula separada que identificará al receptor y la finalidad, para que la persona titular pueda aceptarla o rechazarla. La negativa no afectará servicios que no necesiten esa transferencia.</p>
      </section>

      <section>
        <h3>6. Conservación y eliminación</h3>
        <p>Los datos se conservarán únicamente durante el tiempo necesario para administrar la credencial, los accesos, eventos, becas y responsabilidades derivadas del tratamiento. Al concluir la finalidad y los plazos legales o estatutarios aplicables, se bloquearán y posteriormente se suprimirán o anonimizarán. La cancelación puede no proceder de inmediato cuando exista una obligación de conservación o sea necesario proteger derechos de terceros.</p>
      </section>

      <section>
        <h3>7. Derechos ARCO, limitación y revocación</h3>
        <p>La persona titular o su representante puede solicitar acceso, rectificación, cancelación u oposición; limitar el uso o divulgación; o revocar el consentimiento sin efectos retroactivos, mediante el correo <a href={`mailto:${DATA_PROTECTION_EMAIL}?subject=Solicitud%20ARCO`}>{DATA_PROTECTION_EMAIL}</a> con el asunto “Solicitud ARCO”, o por escrito en el domicilio fiscal y legal.</p>
        <p>La solicitud deberá incluir: nombre y medio para recibir notificaciones; documentos que acrediten identidad y, en su caso, representación; descripción clara de los datos; derecho o petición que se desea ejercer; y elementos que permitan localizar el expediente, como matrícula o folio. Para rectificación deberán acompañarse los documentos que sustenten el cambio.</p>
        <p>El responsable comunicará su determinación en un máximo de 20 días hábiles y, si resulta procedente, la hará efectiva dentro de los 15 días hábiles siguientes; ambos plazos podrán ampliarse una sola vez cuando exista justificación. El ejercicio es gratuito, salvo costos de reproducción o envío permitidos por la ley.</p>
      </section>

      <section>
        <h3>8. Seguridad e incidentes</h3>
        <p>Se aplican medidas administrativas, técnicas y físicas proporcionales al riesgo, incluidos control de acceso por roles, revisión humana previa del registro alternativo, separación de documentos pendientes y expedientes vigentes, comparación protegida de correo y CURP, estados de autenticación de un solo uso con vencimiento, sesiones seguras, bloqueo temporal después de cinco intentos fallidos, trazabilidad administrativa y separación entre metadatos y archivos. Ningún sistema es infalible. Si ocurre una vulneración que afecte significativamente derechos patrimoniales o morales, el responsable informará de manera inmediata a las personas afectadas para que puedan protegerse.</p>
      </section>

      <section>
        <h3>9. Cookies y tecnologías similares</h3>
        <p>La plataforma utiliza exclusivamente cookies técnicas, seguras y necesarias para la sesión y para comprobar temporalmente el estado del acceso con Google. No incorpora cookies publicitarias ni rastreadores comerciales propios. La instalación opcional como aplicación puede conservar recursos técnicos en el dispositivo para mejorar disponibilidad, sin sustituir la base de datos institucional.</p>
      </section>

      <section>
        <h3>10. Fundamento legal</h3>
        <p>El tratamiento se rige por los artículos 6 y 16 de la Constitución Política de los Estados Unidos Mexicanos; la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente, publicada el 20 de marzo de 2025 y reformada el 14 de noviembre de 2025; su Reglamento y los Lineamientos del Aviso de Privacidad en lo que continúen siendo aplicables; así como las disposiciones civiles, mercantiles, laborales, sindicales y demás normas que correspondan.</p>
      </section>

      <section>
        <h3>11. Cambios y autoridad competente</h3>
        <p>Los cambios se publicarán en esta misma sección, indicando versión y fecha. Si una modificación exige un nuevo consentimiento, la plataforma lo solicitará antes de continuar el tratamiento correspondiente.</p>
        <p>Si considera vulnerado su derecho a la protección de datos, puede acudir a la <a href="https://www.gob.mx/buengobierno" target="_blank" rel="noreferrer">Secretaría Anticorrupción y Buen Gobierno</a>, autoridad competente conforme a la legislación vigente.</p>
        <p>Este aviso es específico para la plataforma Credenciales SNTSS1Puebla, Eventos QR y Becas Sinabeth de la Sección 1 Puebla. En todo caso prevalecerán la legislación aplicable y la protección más amplia de la persona titular.</p>
      </section>
    </article>
  );
}

function GeneralTerms() {
  return (
    <article className="legalDocument">
      <header className="legalDocumentLead terms">
        <span>CONDICIONES GENERALES DE USO</span>
        <h2>Credenciales SNTSS1Puebla</h2>
        <p>Versión {GENERAL_TERMS_VERSION} · vigente desde el {LEGAL_EFFECTIVE_DATE}</p>
      </header>

      <section>
        <h3>1. Objeto y aceptación</h3>
        <p>Estas condiciones regulan el registro, revisión y uso de la credencial digital, lectores QR, eventos y Becas Sinabeth operados por <b>{DATA_CONTROLLER_LEGAL_NAME}</b>, RFC {DATA_CONTROLLER_RFC}, con domicilio fiscal y legal en {DATA_CONTROLLER_ADDRESS}. Al enviar el expediente, la persona usuaria declara haberlas leído y aceptado.</p>
        <p>La plataforma es un medio operativo sindical; por sí sola no crea prestaciones ni derechos distintos de los previstos en estatutos, convocatorias, acuerdos o disposiciones aplicables.</p>
      </section>

      <section>
        <h3>2. Elegibilidad y veracidad</h3>
        <ul>
          <li>El titular debe pertenecer al padrón autorizado y usar únicamente su propia matrícula y sesión.</li>
          <li>Los datos y documentos deben ser auténticos, vigentes, legibles y corresponder al titular o a beneficiarios que tenga derecho a registrar.</li>
          <li>Quien registre a otra persona confirma que cuenta con autorización o representación suficiente y se obliga a informarle el aviso de privacidad.</li>
          <li>La persona usuaria deberá corregir datos inexactos y notificar la pérdida de control de su cuenta o credencial.</li>
        </ul>
      </section>

      <section>
        <h3>3. Credencial y código QR</h3>
        <p>La credencial y su QR son personales, únicos e intransferibles. No deben copiarse, alterarse, prestarse, venderse ni utilizarse para suplantar a otra persona. La aprobación documental no sustituye identificaciones oficiales ni garantiza por sí misma acceso a instalaciones, eventos o beneficios sujetos a reglas adicionales.</p>
        <p>El SNTSS puede suspender o revocar una credencial cuando los documentos sean inválidos, cambie la elegibilidad, exista duplicidad, haya indicios razonables de uso indebido o lo ordene autoridad competente. La persona interesada podrá solicitar aclaración o corrección.</p>
      </section>

      <section>
        <h3>4. Accesos, eventos y becas</h3>
        <p>Cada escaneo puede generar una bitácora con fecha, hora, instalación, evento, movimiento y persona operadora. Las reglas, cupos, periodos, categorías, montos y requisitos de eventos o becas serán los de la campaña vigente.</p>
        <p>Los registros oficiales pueden ser corregidos, rechazados o eliminados únicamente por personal autorizado y con trazabilidad, cuando exista error, duplicidad, incumplimiento o causa justificada. El usuario podrá solicitar una aclaración mediante los canales institucionales.</p>
      </section>

      <section>
        <h3>5. Seguridad de la cuenta</h3>
        <p>La persona usuaria es responsable de mantener en reserva sus contraseñas, PIN, CURP, cuenta de Google y dispositivo. Debe usar su propio correo, cerrar la sesión en equipos compartidos y reportar inmediatamente accesos no reconocidos. Queda prohibido intentar eludir controles, extraer datos, interferir con el servicio, automatizar consultas no autorizadas o acceder a expedientes ajenos.</p>
      </section>

      <section>
        <h3>6. Disponibilidad y responsabilidad</h3>
        <p>Se procurará la continuidad y exactitud del servicio, pero pueden existir mantenimientos, fallas de conectividad o revisiones manuales. Ninguna disposición limita derechos irrenunciables ni excluye responsabilidades que legalmente correspondan. El SNTSS responderá conforme a la legislación aplicable y no por afectaciones derivadas exclusivamente de información falsa, uso indebido por la persona usuaria o eventos fuera de su control razonable.</p>
      </section>

      <section>
        <h3>7. Propiedad y uso autorizado</h3>
        <p>El diseño, marcas, emblemas, bases y software institucional se usarán únicamente para los fines autorizados. La credencial puede mostrarse o imprimirse para identificación sindical; no autoriza a explotar comercialmente la imagen institucional ni a crear credenciales apócrifas.</p>
      </section>

      <section>
        <h3>8. Aceptación electrónica</h3>
        <p>La aceptación se obtiene mediante casillas no preseleccionadas. Puede realizarse dentro de una sesión autenticada o en el registro alternativo previo al acceso, que sólo habilita la cuenta después de validar la matrícula y los documentos mediante revisión humana. La matrícula, canal, expediente, fecha del servidor y versiones vigentes integran un registro electrónico de aceptación. La persona usuaria podrá solicitar una copia de su constancia en <a href={`mailto:${DATA_PROTECTION_EMAIL}`}>{DATA_PROTECTION_EMAIL}</a>.</p>
      </section>

      <section>
        <h3>9. Privacidad, jurisdicción, modificaciones y contacto</h3>
        <p>El tratamiento de datos se rige por el Aviso de Privacidad Integral disponible en esta plataforma. Los cambios a estas condiciones se identificarán por versión y fecha; cuando sean sustanciales, se solicitará una nueva aceptación.</p>
        <p>Para privacidad, derechos ARCO, aclaraciones y comunicaciones legales: <a href={`mailto:${DATA_PROTECTION_EMAIL}`}>{DATA_PROTECTION_EMAIL}</a>, o por escrito en el domicilio fiscal y legal señalado.</p>
        <p>Estas condiciones se interpretarán conforme a la legislación federal mexicana. Para las controversias que legalmente puedan someterse a jurisdicción, serán competentes las autoridades y tribunales de Puebla, Puebla, sin renuncia a derechos irrenunciables ni a los mecanismos especiales de protección de datos, laborales o sindicales que correspondan.</p>
      </section>
    </article>
  );
}

export function LegalModal({
  document,
  onClose,
}: {
  document: LegalDocument | null;
  onClose: () => void;
}) {
  if (!document) return null;
  const title = document === "privacy" ? "Aviso de privacidad integral" : "Condiciones generales";
  return (
    <div className="legalOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className="legalModal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="legalModalToolbar">
          <div><small>DOCUMENTO LEGAL</small><b>{title}</b></div>
          <button type="button" onClick={onClose} aria-label={`Cerrar ${title}`}>×</button>
        </div>
        <div className="legalModalScroll">
          {document === "privacy" ? <PrivacyNotice /> : <GeneralTerms />}
        </div>
        <div className="legalModalActions">
          <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf" target="_blank" rel="noreferrer">Consultar ley vigente</a>
          <button type="button" className="button primary" onClick={onClose}>Entendido</button>
        </div>
      </section>
    </div>
  );
}
