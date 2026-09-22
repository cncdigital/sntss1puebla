"use client";

import { useMemo, useState } from "react";

const PAYMENT_MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PAYMENT_LEGEND = [
  ["banks", "Pago bancos", "Banamex, Banorte, BBVA y demás bancos"],
  ["pink", "Santander y Scotiabank", "Fecha diferenciada de depósito"],
  ["check", "Pago con cheque", "Consulta el día señalado"],
  ["retiree", "Pago jubilados", "Fecha mensual de jubilados"],
  ["vacation", "Rol vacacional", "Periodo señalado en el calendario"],
  ["holiday", "Día festivo", "No laborable conforme al calendario"],
] as const;

type PaymentKind = "banks" | "pink" | "check" | "retiree" | "vacation" | "holiday";

type LoanType = "c97-1" | "c97-2" | "c97-3" | "c97-4" | "automovil" | "enganche" | "mediano" | "hipotecario";

const LOAN_OPTIONS: Array<{ type: LoanType; label: string; icon: string; months?: number }> = [
  { type: "c97-1", label: "C97 · 1 mes", icon: "▣", months: 1 },
  { type: "c97-2", label: "C97 · 2 meses", icon: "▤", months: 2 },
  { type: "c97-3", label: "C97 · 3 meses", icon: "▦", months: 3 },
  { type: "c97-4", label: "C97 · 4 meses", icon: "▥", months: 4 },
  { type: "automovil", label: "Automóvil", icon: "▰" },
  { type: "enganche", label: "Enganche", icon: "⌂" },
  { type: "mediano", label: "Mediano plazo", icon: "⚒" },
  { type: "hipotecario", label: "Hipotecario", icon: "⌂" },
];

const HOUSING_LOAN_CONFIG: Partial<Record<LoanType, { factor: number; basis: string; source: string }>> = {
  enganche: { factor: 15, basis: "Salario mensual integrado", source: "Reglamento, artículo 4" },
  mediano: { factor: 35, basis: "Salario mensual integrado", source: "Reglamento, artículos 25 y 27" },
  hipotecario: { factor: 75, basis: "Salario mensual integrado", source: "Reglamento, artículo 4" },
};

// Fechas tomadas de la imagen de referencia. Cada color conserva la fecha
// correspondiente a la primera y segunda quincena de 2026.
const PAYMENT_DATES: Record<number, Record<number, PaymentKind>> = {
  0: { 1: "holiday", 12: "pink", 13: "banks", 14: "check", 16: "vacation", 27: "pink", 28: "banks", 29: "check", 30: "vacation", 31: "retiree" },
  1: { 2: "holiday", 10: "pink", 11: "banks", 12: "check", 16: "vacation", 24: "pink", 25: "banks", 26: "check", 28: "retiree" },
  2: { 2: "vacation", 10: "pink", 11: "banks", 12: "check", 16: "holiday", 19: "vacation", 25: "pink", 26: "banks", 27: "check", 31: "retiree" },
  3: { 2: "holiday", 3: "holiday", 4: "holiday", 6: "vacation", 10: "pink", 11: "banks", 13: "banks", 14: "check", 22: "vacation", 27: "pink", 28: "banks", 29: "check", 30: "retiree" },
  4: { 1: "holiday", 7: "vacation", 10: "holiday", 12: "pink", 13: "banks", 14: "check", 26: "pink", 27: "banks", 28: "check", 30: "retiree" },
  5: { 8: "vacation", 10: "pink", 11: "banks", 12: "check", 22: "vacation", 25: "pink", 26: "banks", 29: "check", 30: "retiree" },
  6: { 6: "vacation", 10: "pink", 11: "banks", 13: "banks", 14: "check", 27: "pink", 28: "banks", 29: "check", 31: "retiree" },
  7: { 3: "vacation", 11: "pink", 12: "banks", 13: "check", 20: "vacation", 25: "pink", 26: "banks", 27: "check", 31: "retiree" },
  8: { 3: "vacation", 9: "pink", 10: "banks", 11: "check", 15: "holiday", 16: "holiday", 21: "vacation", 25: "pink", 26: "banks", 28: "banks", 29: "check", 30: "retiree" },
  9: { 12: "pink", 13: "banks", 14: "check", 19: "vacation", 27: "pink", 28: "banks", 29: "check", 31: "retiree" },
  10: { 2: "vacation", 10: "pink", 11: "banks", 12: "check", 16: "holiday", 17: "vacation", 25: "pink", 26: "banks", 27: "check", 30: "retiree" },
  11: { 1: "vacation", 10: "pink", 11: "banks", 14: "check", 15: "vacation", 24: "pink", 25: "holiday", 28: "banks", 29: "check", 30: "vacation", 31: "retiree" },
};

function money(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

export function WorkerTools() {
  const [fortnightlySalary, setFortnightlySalary] = useState("");
  const [vacationDays, setVacationDays] = useState("");
  const [paymentMonth, setPaymentMonth] = useState(8);
  const [loanType, setLoanType] = useState<LoanType>("c97-1");
  const [loanSalary, setLoanSalary] = useState("");
  const [mortgageLiquidity, setMortgageLiquidity] = useState(false);
  const vacation = useMemo(() => {
    const fortnightly = Number(fortnightlySalary);
    const days = Number(vacationDays);
    if (!Number.isFinite(fortnightly) || !Number.isFinite(days) || fortnightly <= 0 || days <= 0) return null;
    const dailySalary = fortnightly / 15;
    const vacationPay = dailySalary * days;
    const premium = vacationPay * 0.25;
    return { dailySalary, vacationPay, premium, total: vacationPay + premium };
  }, [fortnightlySalary, vacationDays]);
  const paymentDays = useMemo(() => {
    const firstDay = new Date(2026, paymentMonth, 1).getDay();
    const daysInMonth = new Date(2026, paymentMonth + 1, 0).getDate();
    return Array.from({ length: firstDay + daysInMonth }, (_, index) => {
      const day = index < firstDay ? null : index - firstDay + 1;
      const kind = day ? PAYMENT_DATES[paymentMonth][day] || null : null;
      return { day, kind };
    });
  }, [paymentMonth]);
  const loanOption = LOAN_OPTIONS.find((option) => option.type === loanType);
  const housingConfig = HOUSING_LOAN_CONFIG[loanType];
  const loanResult = useMemo(() => {
    const salary = Number(loanSalary);
    if (!loanOption?.months || !Number.isFinite(salary) || salary <= 0) return null;
    const monthlyBase = salary * 2;
    const amount = monthlyBase * loanOption.months;
    const fortnightCount = loanOption.months * 10;
    return { monthlyBase, amount, fortnightCount, fortnightlyPayment: amount / fortnightCount };
  }, [loanSalary, loanOption]);
  const housingResult = useMemo(() => {
    const tabularFortnightly = Number(loanSalary);
    if (!housingConfig || !Number.isFinite(tabularFortnightly) || tabularFortnightly <= 0) return null;
    const conceptFortnightly = tabularFortnightly * 0.8215;
    const integratedMonthlySalary = (tabularFortnightly + conceptFortnightly) * 2 * 1.2;
    const factor = loanType === "hipotecario" && mortgageLiquidity ? 90 : housingConfig.factor;
    return { conceptFortnightly, integratedMonthlySalary, factor, amount: integratedMonthlySalary * factor };
  }, [housingConfig, loanSalary, loanType, mortgageLiquidity]);

  return (
    <main className="workerTools" aria-labelledby="worker-tools-title">
      <header className="workerToolsHero">
        <div>
          <span>CENTRO DEL TRABAJADOR</span>
          <h1 id="worker-tools-title">Resuelve más rápido, con la ruta correcta</h1>
          <p>Consulta pagos y calcula referencias de vacaciones y préstamos conforme a tu información laboral.</p>
        </div>
        <aside><b>Privacidad primero</b><small>Los cálculos y selecciones se realizan en tu dispositivo. No guardamos estos datos.</small></aside>
      </header>

      <section className="workerToolGrid">
        <article className="workerToolCard paymentCalendarCard">
          <span className="workerToolNumber">01</span>
          <h2>Calendario propio de pagos 2026</h2>
          <p>Consulta ambas quincenas por mes, con las fechas y colores de bancos, cheque, jubilados, festivos y rol vacacional.</p>
          <div className="paymentMonthPicker" role="tablist" aria-label="Mes del calendario de pagos">
            {PAYMENT_MONTHS.map((month, index) => (
              <button type="button" role="tab" aria-selected={paymentMonth === index} className={paymentMonth === index ? "active" : ""} onClick={() => setPaymentMonth(index)} key={month}>{month.slice(0, 3)}</button>
            ))}
          </div>
          <div className="nativePaymentCalendar" aria-label={`Calendario de pagos de ${PAYMENT_MONTHS[paymentMonth]} 2026`}>
            <header><b>{PAYMENT_MONTHS[paymentMonth]} 2026</b><span>Fechas configuradas en la app</span></header>
            <div className="paymentWeekdays">{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="paymentDays">{paymentDays.map((item, index) => <div className={`paymentDay ${item.kind || ""}`} key={`${item.day}-${index}`}>{item.day ? <><b>{item.day}</b>{item.kind ? <i aria-label={PAYMENT_LEGEND.find(([key]) => key === item.kind)?.[1]} /> : null}</> : null}</div>)}</div>
          </div>
          <div className="paymentLegend">{PAYMENT_LEGEND.map(([key, label, detail]) => <span key={key}><i className={key} /> <b>{label}</b><small>{detail}</small></span>)}</div>
        </article>

        <article className="workerToolCard vacationTool workerToolCardSolo">
          <span className="workerToolNumber">02</span>
          <h2>Calculadora de vacaciones</h2>
          <p>Captura tu sueldo quincenal. La herramienta obtiene el equivalente diario y estima el pago de vacaciones más la prima vacacional del 25% asociada al concepto 29.</p>
          <div className="vacationInputs">
            <label>
              <span>Sueldo quincenal</span>
              <input inputMode="decimal" type="number" min="0" step="0.01" value={fortnightlySalary} onChange={(event) => setFortnightlySalary(event.target.value)} placeholder="Ej. 7,500.00" />
            </label>
            <label>
              <span>Días de vacaciones autorizados</span>
              <input inputMode="numeric" type="number" min="1" step="1" value={vacationDays} onChange={(event) => setVacationDays(event.target.value)} placeholder="Ej. 16" />
            </label>
          </div>
          <div className="vacationResult" aria-live="polite">
            {vacation ? (
              <>
                <div><span>Equivalente diario · quincena ÷ 15</span><strong>{money(vacation.dailySalary)}</strong></div>
                <div><span>Pago por días</span><strong>{money(vacation.vacationPay)}</strong></div>
                <div><span>Prima vacacional · concepto 29</span><strong>{money(vacation.premium)}</strong></div>
                <div className="vacationTotal"><span>Total estimado</span><strong>{money(vacation.total)}</strong></div>
              </>
            ) : (
              <p>Ingresa tu sueldo quincenal y los días autorizados para calcular una referencia.</p>
            )}
          </div>
          <small className="workerToolNote">La antigüedad ya aparece en tu tarjetón. El cálculo es orientativo: revisa el concepto 29, los días autorizados y el pago real en tu nómina.</small>
        </article>

        <article className="workerToolCard loanCalculatorCard">
          <span className="workerToolNumber">03</span>
          <h2>Calculadora de préstamos</h2>
          <p>Selecciona el tipo de préstamo y captura la base salarial que corresponda. En la Cláusula 97 se utiliza el sueldo base quincenal.</p>
          <div className="loanOptionGrid" role="list" aria-label="Tipo de préstamo">
            {LOAN_OPTIONS.map((option) => (
              <button type="button" className={`loanOption ${loanType === option.type ? "active" : ""}`} onClick={() => setLoanType(option.type)} key={option.type}>
                <span aria-hidden="true">{option.icon}</span>
                <b>{option.label}</b>
              </button>
            ))}
          </div>
          {loanOption?.months ? (
            <div className="loanInputs">
              <label>
                <span>Sueldo base quincenal</span>
                <input inputMode="decimal" type="number" min="0" step="0.01" value={loanSalary} onChange={(event) => setLoanSalary(event.target.value)} placeholder="Ej. 7,500.00" />
                <small>Captura el sueldo base de una quincena que aparece en tu tarjetón; no sumes prestaciones ni conceptos adicionales.</small>
              </label>
            </div>
          ) : housingConfig ? (
            <div className="loanInputs housingLoanInputs">
              <label>
                <span>Sueldo tabular quincenal</span>
                <input inputMode="decimal" type="number" min="0" step="0.01" value={loanSalary} onChange={(event) => setLoanSalary(event.target.value)} placeholder="Ej. 7,500.00" />
              </label>
              {loanType === "hipotecario" && <label className="loanCheckbox"><input type="checkbox" checked={mortgageLiquidity} onChange={(event) => setMortgageLiquidity(event.target.checked)} /><span>Acreditar liquidez para considerar hasta 90 veces el salario mensual integrado</span></label>}
              <small>El concepto b se calcula automáticamente: 82.15% del sueldo tabular, conforme a la Cláusula 63 Bis, inciso b).</small>
            </div>
          ) : (
            <div className="loanInputs">
              <label>
                <span>Sueldo quincenal</span>
                <input inputMode="decimal" type="number" min="0" step="0.01" value={loanSalary} onChange={(event) => setLoanSalary(event.target.value)} placeholder="Ej. 7,500.00" />
                <small>Captura la base salarial que defina la cláusula o reglamento correspondiente.</small>
              </label>
            </div>
          )}
          {loanOption?.months ? (
            <div className="loanResult" aria-live="polite">
              {loanResult ? (
                <>
                  <div><span>Equivalente mensual · 2 quincenas</span><strong>{money(loanResult.monthlyBase)}</strong></div>
                  <div><span>Monto máximo de referencia</span><strong>{money(loanResult.amount)}</strong></div>
                  <div><span>Amortización ordinaria</span><strong>{loanResult.fortnightCount} quincenas</strong></div>
                  <div className="loanTotal"><span>Descuento estimado por quincena</span><strong>{money(loanResult.fortnightlyPayment)}</strong></div>
                </>
              ) : <p>Captura tu sueldo base quincenal para calcular una referencia.</p>}
            </div>
          ) : housingConfig ? (
            <div className="loanResult" aria-live="polite">
              {housingResult ? (
                <>
                  <div><span>Concepto b calculado · 82.15%</span><strong>{money(housingResult.conceptFortnightly)} por quincena</strong></div>
                  <div><span>Salario mensual integrado estimado</span><strong>{money(housingResult.integratedMonthlySalary)}</strong></div>
                  <div><span>Factor reglamentario</span><strong>{housingResult.factor} veces SMI</strong></div>
                  <div className="loanTotal"><span>Monto máximo de referencia</span><strong>{money(housingResult.amount)}</strong></div>
                </>
              ) : <p>Captura el sueldo tabular quincenal para calcular una referencia.</p>}
            </div>
          ) : (
            <div className="loanPending"><b>{loanOption?.label}</b><p>Este tipo de préstamo requiere consultar el tope, porcentaje y requisitos específicos establecidos en su cláusula, convocatoria o reglamento vigente.</p></div>
          )}
          <small className="workerToolNote">{loanOption?.months ? "Cláusula 97: el cálculo usa el sueldo base quincenal y lo convierte a dos quincenas por mes. El anticipo no genera intereses y la amortización ordinaria considera 10 quincenas por cada mes solicitado." : housingConfig ? `Fundamento: ${housingConfig.source}. El resultado es orientativo y depende del expediente, valor del inmueble, garantías, liquidez, convocatoria y autorización correspondiente.` : "El cálculo de este tipo de préstamo se habilitará cuando se confirme su cláusula, base salarial y tope aplicable."} Resultado informativo; confirma requisitos con la cartera correspondiente.</small>
        </article>
      </section>
    </main>
  );
}
