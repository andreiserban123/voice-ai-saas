export default function DashboardPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">SERVICE AUTO · RECEPȚIE TELEFONICĂ</p>
        <h1>Mai mult timp pentru atelier.</h1>
        <p>Apelurile și programările service-ului, într-un singur loc.</p>
      </section>
      <aside className="notice">
        <strong>Recepționerul nu este încă activ.</strong>
        <p>Configurarea companiei, a numărului de telefon și a calendarului urmează. Această pagină nu afișează încă date reale.</p>
      </aside>
      <div className="grid">
        <section className="panel" aria-labelledby="calls-title">
          <h2 id="calls-title">Apeluri recente</h2>
          <div className="empty">
            <span className="symbol" aria-hidden="true">↗</span>
            <h3>Aici începe conversația</h3>
            <p>După activare, vei putea consulta apelurile, rezumatele și informațiile oferite de clienți.</p>
          </div>
        </section>
        <section className="panel" aria-labelledby="appointments-title">
          <h2 id="appointments-title">Programări</h2>
          <div className="empty">
            <span className="symbol" aria-hidden="true">◷</span>
            <h3>Un calendar mai ușor de urmărit</h3>
            <p>Programările confirmate telefonic vor apărea aici, împreună cu detaliile mașinii și ale solicitării.</p>
          </div>
        </section>
      </div>
      <footer>Conceput pentru service-uri auto independente din România.</footer>
    </>
  );
}
