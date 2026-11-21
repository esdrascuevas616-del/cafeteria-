"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const money = (value) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 }).format(Number(value || 0));

const initialProducts = [
  { id: "demo-1", nombre: "Sándwich de jamón y queso", descripcion: "Pan fresco, jamón y queso", precio: 150, stock_actual: 12, disponible: true, categoria: "Comida", emoji: "🥪" },
  { id: "demo-2", nombre: "Pastelito", descripcion: "Relleno de pollo", precio: 65, stock_actual: 20, disponible: true, categoria: "Comida", emoji: "🥟" },
  { id: "demo-3", nombre: "Jugo natural", descripcion: "Fruta de temporada", precio: 90, stock_actual: 8, disponible: true, categoria: "Bebidas", emoji: "🧃" },
  { id: "demo-4", nombre: "Café", descripcion: "Café recién preparado", precio: 50, stock_actual: 15, disponible: true, categoria: "Bebidas", emoji: "☕" },
];

export default function Home() {
  const [view, setView] = useState("estudiante");
  const [products, setProducts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [cart, setCart] = useState({});
  const [warm, setWarm] = useState(false);
  const [payment, setPayment] = useState("Efectivo");
  const [matricula, setMatricula] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [dbReady, setDbReady] = useState(Boolean(supabase));

  const loadData = useCallback(async () => {
    if (!supabase) {
      setProducts(initialProducts);
      setLoading(false);
      setDbReady(false);
      return;
    }
    const [p, t] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("tickets").select("*, ticket_items(id, producto_id, nombre_producto, cantidad, precio_unitario)").order("created_at", { ascending: true }),
    ]);
    if (p.error) setNotice(`Productos: ${p.error.message}`);
    else setProducts(p.data || []);
    if (t.error) setNotice(`Tickets: ${t.error.message}`);
    else setTickets(t.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    if (!supabase) return;
    const channel = supabase
      .channel("cafeteria-ucsd-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_items" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const cartItems = useMemo(() => products.filter((p) => cart[p.id]).map((p) => ({ ...p, cantidad: cart[p.id] })), [products, cart]);
  const total = cartItems.reduce((sum, item) => sum + Number(item.precio) * item.cantidad, 0);

  function changeQty(product, delta) {
    setCart((old) => {
      const next = { ...old };
      const amount = Math.max(0, Math.min(Number(product.stock_actual), (next[product.id] || 0) + delta));
      if (amount) next[product.id] = amount;
      else delete next[product.id];
      return next;
    });
  }

  async function placeOrder() {
    if (!supabase) return setNotice("Conecta Supabase para generar pedidos reales. El catálogo de demostración está activo.");
    if (!matricula.trim()) return setNotice("Escribe tu matrícula universitaria.");
    if (!cartItems.length) return setNotice("Agrega al menos un producto.");
    setBusy(true); setNotice("");
    const payload = cartItems.map((item) => ({ producto_id: item.id, cantidad: item.cantidad }));
    const { data, error } = await supabase.rpc("crear_ticket", {
      p_items: payload,
      p_calentar: warm,
      p_metodo_pago: payment,
      p_matricula: matricula.trim(),
    });
    setBusy(false);
    if (error) return setNotice(error.message);
    setMyTicket(data);
    setCart({});
    setView("ticket");
    await loadData();
  }

  async function updateStock(product, action) {
    if (!supabase) return setNotice("Configura Supabase para modificar el inventario.");
    const stock = action === "agotado" ? 0 : Math.max(0, Number(product.stock_actual) + (action === "mas" ? 1 : -1));
    const { error } = await supabase.from("productos").update({ stock_actual: stock, disponible: stock > 0 }).eq("id", product.id);
    if (error) setNotice(error.message);
    else await loadData();
  }

  async function updateTicket(ticket, estado) {
    if (!supabase) return setNotice("Configura Supabase para gestionar turnos.");
    const { error } = await supabase.from("tickets").update({ estado }).eq("id", ticket.id);
    if (error) setNotice(error.message);
    else await loadData();
  }

  const activeTicket = myTicket ? tickets.find((t) => t.id === myTicket.id) || myTicket : null;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-icon">☕</span><span><b>Cafetería UCSD</b><small>Tu pausa, sin filas.</small></span></a>
        <div className="status"><i className={dbReady ? "dot live" : "dot"} />{dbReady ? "Sistema conectado" : "Modo demostración"}</div>
      </header>

      <section className="hero">
        <div><span className="eyebrow">UNIVERSIDAD CATÓLICA SANTO DOMINGO</span><h1>Una pausa rica.<br/><em>Sin esperar de más.</em></h1><p>Consulta la vitrina, pide desde donde estés y recoge cuando esté listo.</p></div>
        <div className="hero-art"><span>☕</span><small>HECHO PARA TU DÍA</small></div>
      </section>

      <nav className="tabs">
        <button className={view === "estudiante" || view === "ticket" ? "active" : ""} onClick={() => setView("estudiante")}>☻ Estudiantes</button>
        <button className={view === "barra" ? "active" : ""} onClick={() => setView("barra")}>▤ Barra / Despacho</button>
      </nav>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {view === "estudiante" && (
        <div className="content-grid">
          <section>
            <div className="section-head"><div><span className="eyebrow">VITRINA DIGITAL</span><h2>¿Qué se te antoja?</h2></div><span className="live-label"><i className="dot live"/> Stock en vivo</span></div>
            {loading ? <p className="muted">Cargando vitrina…</p> : <div className="product-grid">
              {products.map((p) => <article className={`product-card ${!p.disponible || p.stock_actual < 1 ? "sold" : ""}`} key={p.id}>
                <div className="product-emoji">{p.emoji || (p.categoria === "Bebidas" ? "🥤" : "🍽️")}</div>
                <div className="product-info"><span className="category">{p.categoria || "Vitrina"}</span><h3>{p.nombre}</h3><p>{p.descripcion || "Preparado para ti."}</p>
                  <div className="product-bottom"><b>{money(p.precio)}</b><span className="stock">{p.stock_actual > 0 ? `${p.stock_actual} disponibles` : "Agotado"}</span></div>
                </div>
                <button className="add-btn" disabled={!p.disponible || p.stock_actual < 1} onClick={() => changeQty(p, 1)}>+</button>
                {cart[p.id] > 0 && <span className="qty-badge">{cart[p.id]} en pedido</span>}
              </article>)}
            </div>}
          </section>
          <aside className="order-card">
            <div className="order-title"><div><span className="eyebrow">TU PEDIDO</span><h2>Orden rápida</h2></div><span className="bag">▣</span></div>
            {cartItems.length ? <div className="cart-list">{cartItems.map((item) => <div className="cart-row" key={item.id}><div><b>{item.nombre}</b><small>{money(item.precio)} c/u</small></div><div className="stepper"><button onClick={() => changeQty(item, -1)}>−</button><b>{item.cantidad}</b><button onClick={() => changeQty(item, 1)}>+</button></div></div>)}</div> : <div className="empty-cart"><span>🛍️</span><p>Tu pedido está vacío.</p><small>Agrega algo rico de la vitrina.</small></div>}
            <label className="field-label" htmlFor="matricula">Matrícula universitaria</label>
            <input id="matricula" className="text-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Escribe tu matrícula" autoComplete="off" />
            <label className="check-row"><input type="checkbox" checked={warm} onChange={(e) => setWarm(e.target.checked)}/><span>♨️ Calentar en microondas</span></label>
            <label className="field-label" htmlFor="payment">Método de pago</label>
            <select id="payment" value={payment} onChange={(e) => setPayment(e.target.value)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select>
            <div className="total-row"><span>Total</span><strong>{money(total)}</strong></div>
            <button className="primary-btn" disabled={!cartItems.length || !matricula.trim() || busy} onClick={placeOrder}>{busy ? "Generando…" : "Generar mi turno →"}</button>
            <small className="secure-note">Tu turno aparecerá aquí y se actualizará en vivo.</small>
          </aside>
        </div>
      )}

      {view === "ticket" && (
        <section className="ticket-wrap">
          <div className="ticket-card"><div className="success-mark">✓</div><span className="eyebrow">PEDIDO RECIBIDO</span><h2>¡Ya casi está!</h2><p>Tu código de turno es</p><div className="ticket-code">{activeTicket?.codigo || "UCSD-—"}</div>
            <p><strong>Matrícula:</strong> {activeTicket?.matricula || matricula}</p>
            <div className="ticket-state"><span>Estado del pedido</span><b className="state-pill">{activeTicket?.estado || "Pendiente"}</b></div>
            <p className="ticket-hint">Conserva este código y preséntalo al retirar tu pedido.</p><button className="primary-btn" onClick={() => setView("estudiante")}>Volver a la vitrina</button>
          </div>
        </section>
      )}

      {view === "barra" && (
        <section className="bar-view">
          <div className="section-head"><div><span className="eyebrow">OPERACIONES</span><h2>Panel de barra</h2><p className="muted">Controla existencias y despacha los turnos.</p></div><button className="outline-btn" onClick={loadData}>↻ Actualizar</button></div>
          <div className="bar-columns">
            <div className="panel"><div className="panel-head"><h3>Inventario de vitrina</h3><span>{products.length} productos</span></div>
              {products.map((p) => <div className="inventory-row" key={p.id}><div className="inventory-emoji">{p.emoji || "🍽️"}</div><div className="inventory-name"><b>{p.nombre}</b><small>{p.disponible ? "Disponible" : "Agotado"}</small></div><strong>{p.stock_actual}</strong><div className="inventory-actions"><button onClick={() => updateStock(p, "menos")} disabled={p.stock_actual < 1}>−</button><button onClick={() => updateStock(p, "mas")}>+</button><button className="exhaust" onClick={() => updateStock(p, "agotado")}>Agotar</button></div></div>)}
            </div>
            <div className="panel"><div className="panel-head"><h3>Turnos activos</h3><span>{tickets.filter((t) => t.estado !== "Entregado").length} pendientes</span></div>
              {tickets.filter((t) => t.estado !== "Entregado").length ? tickets.filter((t) => t.estado !== "Entregado").map((t) => <article className="dispatch-ticket" key={t.id}><div className="dispatch-top"><b>{t.codigo}</b><span className="state-pill">{t.estado}</span></div><div className="dispatch-meta"><span>Matrícula del estudiante</span><b>{t.matricula || "No registrada"}</b></div><div className="dispatch-items">{(t.ticket_items || []).map((i) => <span key={i.id}>{i.cantidad}× {i.nombre_producto}</span>)}</div><div className="dispatch-meta"><span>{t.metodo_pago}</span><b>{money(t.total)}</b></div><div className="dispatch-actions">{t.estado === "Pendiente" && <button className="primary-btn compact" onClick={() => updateTicket(t, "Cobrado / Listo")}>Cobrado / Listo</button>}<button className="outline-btn compact" onClick={() => updateTicket(t, "Entregado")}>Entregado</button></div></article>) : <div className="empty-cart"><span>✓</span><p>No hay turnos activos.</p><small>Los nuevos pedidos aparecerán aquí.</small></div>}
            </div>
          </div>
        </section>
      )}

      <footer><span>© {new Date().getFullYear()} Cafetería UCSD</span><span>Menos filas. Más tiempo para ti.</span></footer>
    </main>
  );
}
