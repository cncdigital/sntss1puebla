"use client";

import { useEffect, useMemo, useState } from "react";
import "./casa-cultura.css";

type CasaItem = { id:string; title:string; kind:"publicación"|"curso"|"turismo"|"convenio"; text:string; schedule?:string; level?:string; image?:string; };
const DEFAULT_ITEMS: CasaItem[] = [
  {id:"arte",kind:"publicación",title:"Arte, cultura y comunidad",text:"Un espacio para desarrollar la creatividad, aprender nuevas disciplinas y fortalecer la convivencia sindical.",image:"/casa-cultura-arte.jpg"},
  {id:"idiomas",kind:"curso",title:"Idiomas",text:"Inglés, francés y alemán para niñas, niños, adolescentes, adultos y jubilados.",schedule:"Consulta horarios y grupos disponibles.",level:"Todos los niveles",image:"/casa-cultura-idiomas.jpg"},
  {id:"musica",kind:"curso",title:"Música",text:"Guitarra, rondalla, coro, batería y guitarra eléctrica.",schedule:"Clases entre semana y sábados.",level:"Inicial e intermedio",image:"/casa-cultura-musica.jpg"},
  {id:"artes",kind:"curso",title:"Artes escénicas y visuales",text:"Teatro, danza, folclórica, arte y pintura, fotografía y amigurumis.",schedule:"Horarios sujetos a apertura de grupos.",level:"Niñas, niños, jóvenes, adultos y jubilados",image:"/casa-cultura-artes.jpg"},
  {id:"turismo",kind:"turismo",title:"Turismo sindical",text:"Próximamente encontrarás recorridos, destinos, actividades culturales y promociones para disfrutar Puebla y México.",schedule:"Publicaremos calendario, costos y cupos en este espacio.",image:"/casa-cultura-portada.jpg"},
];
const KEY="sntss-casa-cultura-items-v1";

export function CasaCulturaPanel({ canManage=false }: { canManage?: boolean }) {
  const [items,setItems]=useState<CasaItem[]>(DEFAULT_ITEMS);
  const [active,setActive]=useState<"todos"|CasaItem["kind"]>("todos");
  const [editing,setEditing]=useState<CasaItem|null>(null);
  const [notice,setNotice]=useState("");
  useEffect(()=>{ try { const saved=localStorage.getItem(KEY); if(saved) setItems(JSON.parse(saved)); } catch {} },[]);
  const visible=useMemo(()=>active==="todos"?items:items.filter(i=>i.kind===active),[active,items]);
  const saveAll=(next:CasaItem[])=>{setItems(next); try {localStorage.setItem(KEY,JSON.stringify(next));} catch {}};
  const submit=(event:React.FormEvent)=>{event.preventDefault(); if(!editing)return; const exists=items.some(i=>i.id===editing.id); saveAll(exists?items.map(i=>i.id===editing.id?editing:i):[...items,{...editing,id:crypto.randomUUID()}]); setEditing(null); setNotice("Contenido actualizado en este dispositivo."); setTimeout(()=>setNotice(""),3000);};
  return <main className="casaCultura">
    <section className="casaHero">
      <div><span className="casaEyebrow">SNTSS · SECCIÓN I PUEBLA</span><h1>Casa de Cultura del Arte</h1><p>Un espacio para aprender, crear, convivir y descubrir nuevos destinos.</p><div className="casaPills"><span>Arte</span><span>Cultura</span><span>Turismo</span></div></div>
      <img src="/casa-cultura-portada.jpg" alt="Casa de Cultura del Arte del SNTSS" />
    </section>
    <section className="casaIntro"><div><span className="casaEyebrow">TODOS JUNTOS TODOS FUERTES</span><h2>Talento que se organiza, comunidad que crece.</h2></div><p>Consulta publicaciones, cursos, horarios, convenios y actividades culturales de la Sección I Puebla.</p></section>
    <div className="casaFilters" role="tablist">{(["todos","publicación","curso","turismo","convenio"] as const).map(k=><button key={k} className={active===k?"active":""} onClick={()=>setActive(k)}>{k==="todos"?"Todo":k[0].toUpperCase()+k.slice(1)}</button>)}</div>
    <section className="casaGrid">{visible.map(item=><article className="casaCard" key={item.id}>{item.image&&<img src={item.image} alt="" /> }<div className="casaCardBody"><span className="casaTag">{item.kind}</span><h3>{item.title}</h3><p>{item.text}</p>{item.level&&<small><b>Niveles:</b> {item.level}</small>}{item.schedule&&<small><b>Horarios:</b> {item.schedule}</small>}{canManage&&<button className="casaEdit" onClick={()=>setEditing(item)}>Editar contenido</button>}</div></article>)}</section>
    <section className="casaCallout"><div><span className="casaEyebrow">MÁS INFORMACIÓN</span><h2>Costos, promociones e inscripciones</h2><p>La Secretaría de Cultura publicará aquí convocatorias, cupos, horarios y cursos. Consulta siempre la versión más reciente.</p></div><div className="casaContact">📞 <b>221 657 2812</b><small>Casa de Cultura del Arte</small></div></section>
    {canManage&&<section className="casaManager"><div><span className="casaEyebrow">SECRETARIO DE CULTURA</span><h2>Administrar Casa de Cultura</h2><p>Agrega publicaciones, cursos, convenios, horarios y turismo.</p></div><button className="casaPrimary" onClick={()=>setEditing({id:"",title:"",kind:"publicación",text:"",schedule:"",level:"",image:""})}>+ Nueva publicación</button></section>}
    {notice&&<div className="casaNotice" role="status">{notice}</div>}
    {editing&&<div className="casaModal"><form onSubmit={submit}><button type="button" className="casaClose" onClick={()=>setEditing(null)}>×</button><h2>{editing.id?"Editar contenido":"Nuevo contenido"}</h2><label>Título<input required value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Tipo<select value={editing.kind} onChange={e=>setEditing({...editing,kind:e.target.value as CasaItem["kind"]})}><option>publicación</option><option>curso</option><option>turismo</option><option>convenio</option></select></label><label>Descripción<textarea required value={editing.text} onChange={e=>setEditing({...editing,text:e.target.value})}/></label><label>Horario<input value={editing.schedule||""} onChange={e=>setEditing({...editing,schedule:e.target.value})}/></label><label>Niveles<input value={editing.level||""} onChange={e=>setEditing({...editing,level:e.target.value})}/></label><label>Imagen URL<input value={editing.image||""} onChange={e=>setEditing({...editing,image:e.target.value})}/></label><button className="casaPrimary" type="submit">Guardar contenido</button></form></div>}
  </main>;
}