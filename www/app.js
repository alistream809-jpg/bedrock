'use strict';
const $=s=>document.querySelector(s),yld=()=>new Promise(r=>setTimeout(r,0));
// ---- Version DB: Bedrock feature releases (verify/extend; custom x.y.z accepted) ----
const VERS=['1.16.100','1.16.200','1.16.210','1.16.220','1.17.0','1.17.10','1.17.30','1.17.40','1.18.0','1.18.10','1.18.30','1.19.0','1.19.10','1.19.20','1.19.30','1.19.40','1.19.50','1.19.60','1.19.70','1.19.80','1.20.0','1.20.10','1.20.30','1.20.40','1.20.50','1.20.60','1.20.70','1.20.80','1.21.0','1.21.20','1.21.30','1.21.40','1.21.50','1.21.60','1.21.70','1.21.80','1.21.90','1.21.100'].reverse();
const vn=v=>{const p=v.split('.').map(Number);return p[0]*1e6+p[1]*1e3+p[2]};
let target=VERS[0],jar=null,az=null,out=null,cur=null,logs=[];
const DB={get:()=>JSON.parse(localStorage.getItem('j2b')||'{"p":[],"h":[]}'),set:d=>localStorage.setItem('j2b',JSON.stringify(d))};
const log=(m,c='')=>{logs.push(m);$('#log').innerHTML+=`<div class="${c}">${m}</div>`;$('#log').scrollTop=1e9},prog=p=>$('#bar').style.width=p+'%';
const san=n=>n.toLowerCase().replace(/[^a-z0-9_.-]/g,'_');
const tm=t=>t&&t.match(/^\s*(\w+)\s*=\s*"([^"]*)"/gm)||[];
const tv=(t,k)=>{const m=t.match(new RegExp('^\\s*'+k+'\\s*=\\s*"([^"]*)"','m'));return m&&m[1]};
const rj=async p=>{const f=jar.file(p);if(!f)return null;try{return JSON.parse((await f.async('string')).replace(/^\uFEFF/,''))}catch(e){return null}};
// ---- 1. JAR ANALYZER ----
async function analyze(file){
  jar=await JSZip.loadAsync(file);const names=Object.keys(jar.files).filter(n=>!jar.files[n].dir);
  const a={loader:'Unknown',id:'',version:'',mc:'',deps:[],ns:new Set(),blocks:[],items:[],entities:[],tex:{block:[],item:[],entity:[]},recipes:[],loot:[],sounds:[],particles:[],classes:0,flags:{},lang:{},warn:[]};
  const has=n=>names.includes(n);
  if(has('META-INF/neoforge.mods.toml'))a.loader='NeoForge';else if(has('META-INF/mods.toml'))a.loader='Forge';else if(has('fabric.mod.json'))a.loader='Fabric';else if(has('quilt.mod.json'))a.loader='Quilt';else if(has('mcmod.info'))a.loader='Forge (legacy)';
  const tf=['META-INF/neoforge.mods.toml','META-INF/mods.toml'].find(has);
  if(tf){const t=await jar.file(tf).async('string');a.id=tv(t,'modId')||'';a.version=tv(t,'version')||'';a.name=tv(t,'displayName');a.mc=(t.match(/modId\s*=\s*"minecraft"[\s\S]*?versionRange\s*=\s*"([^"]*)"/)||[])[1]||'';a.deps=[...t.matchAll(/modId\s*=\s*"([^"]+)"/g)].map(m=>m[1]).filter(x=>!['minecraft','forge','neoforge',a.id].includes(x))}
  const fm=await rj('fabric.mod.json');if(fm){a.id=fm.id;a.version=fm.version;a.name=fm.name;a.mc=(fm.depends||{}).minecraft||'';a.deps=Object.keys(fm.depends||{}).filter(x=>!['minecraft','fabricloader','java'].includes(x))}
  const mi=await rj('mcmod.info');if(mi){const m=(mi.modList||mi)[0]||{};a.id=m.modid;a.name=m.name;a.version=m.version;a.mc=m.mcversion||''}
  const cls=[];
  for(const n of names){let m;
    if(n.endsWith('.class')){a.classes++;cls.push(n);continue}
    if(m=n.match(/^assets\/([^/]+)\/(.*)$/)){a.ns.add(m[1]);const r=m[2];
      if(m=r.match(/^textures\/(block|item|entity)\/(.+)\.png$/))a.tex[m[1]].push([n,m[1+1],r]);
      else if(m=r.match(/^blockstates\/([^/]+)\.json$/))a.blocks.push(m[1]);
      else if(m=r.match(/^models\/item\/([^/]+)\.json$/))a.items.push(m[1]);
      else if(r.match(/^sounds\/.+\.ogg$/))a.sounds.push(n);else if(r.match(/^particles\/.+\.json$/))a.particles.push(n)}
    if(m=n.match(/^data\/([^/]+)\/(recipes?)\/(.+)\.json$/)){a.ns.add(m[1]);a.recipes.push(n)}
    if(m=n.match(/^data\/([^/]+)\/(loot_tables?)\/(.+)\.json$/))a.loot.push(n)}
  a.ns=[...a.ns].filter(x=>x!=='minecraft'&&x!=='forge');a.ns0=a.id||a.ns[0]||'mod';a.items=a.items.filter(i=>!a.blocks.includes(i));
  a.entities=[...new Set(a.tex.entity.map(t=>t[2].replace(/^textures\/entity\//,'').replace(/\.png$/,'').split('/')[0]))];
  const sig={'Forge events':'net/minecraftforge/event','NeoForge events':'net/neoforged','Fabric API':'net/fabricmc/fabric/api','Mixins':'org/spongepowered/asm/mixin','Custom GUI/screens':'net/minecraft/client/gui','Block entities':'BlockEntity','Custom entity AI':'net/minecraft/world/entity/ai'};
  for(const c of cls.slice(0,400)){const s=await jar.file(c).async('string');for(const[k,v]of Object.entries(sig))if(s.includes(v))a.flags[k]=1}
  const lf=a.ns.map(n=>`assets/${n}/lang/en_us.json`).find(has);if(lf)a.lang=await rj(lf)||{};
  if(!a.blocks.length&&!a.items.length&&!a.tex.block.length&&!a.tex.item.length)a.warn.push('No Java assets found: nothing here can be converted.');
  return a}
// ---- 2. VALIDATOR ----
function validate(files,v){const w=[],n=vn(v),idre=/^[a-z0-9_.-]+:[a-z0-9_.-]+$/;
  if(n<vn('1.20.10'))w.push(['wn','Custom blocks/items may require the "Holiday Creator Features" experiment on '+v]);
  if(n<vn('1.20.50'))w.push(['wn','Pre-1.20.50 item format used (legacy icon/category components)']);
  if(n<vn('1.20.80'))w.push(['wn','Blocks use legacy texture mapping (blocks.json); no material_instances before 1.20.80']);
  let bad=0;for(const[p,d]of Object.entries(files)){if(p.endsWith('.json')){try{const o=JSON.parse(d);const id=o['minecraft:block']?.description?.identifier||o['minecraft:item']?.description?.identifier;if(id&&!idre.test(id)){bad++;w.push(['er','Invalid identifier '+id])}}catch(e){bad++;w.push(['er','Invalid JSON: '+p])}}}
  return{w,bad}}
// ---- 3. CONVERSION ENGINE / PACK GENERATOR ----
const mapId=s=>typeof s==='string'?s:(s&&(s.item||s.id))||'';
function mapLoot(j,w){const pools=(j.pools||[]).map(p=>({rolls:typeof p.rolls==='number'?p.rolls:(p.rolls&&p.rolls.min?{min:p.rolls.min,max:p.rolls.max}:1),entries:(p.entries||[]).filter(e=>{if(e.type?.endsWith('item'))return true;w.push('Loot entry type '+e.type+' dropped');return false}).map(e=>{const o={type:'item',name:e.name,weight:e.weight||1};(e.functions||[]).forEach(f=>{if(f.function?.endsWith('set_count'))(o.functions=o.functions||[]).push({function:'set_count',count:f.count});else w.push('Loot function '+f.function+' dropped')});if(e.conditions)w.push('Loot conditions dropped (manual work)');return o})}));return{pools}}
async function convert(a,v,o){
  const ns=san(a.ns0),n=vn(v),F={},rep={ok:[],part:[],bad:[]},nm=san(o.name||a.name||ns);
  const id=x=>`${ns}:${san(x)}`,steps=7;let st=0;const P=()=>prog(Math.round(++st/steps*70));
  const uBP=crypto.randomUUID(),uRP=crypto.randomUUID(),min=v.split('.').map(Number);
  const mf=(t,u,mu,dep)=>JSON.stringify({format_version:2,header:{name:nm+(t=='data'?' BP':' RP'),description:'Converted from '+jar_name+' by Java to Bedrock',uuid:u,version:[1,0,0],min_engine_version:min},modules:[{type:t,uuid:mu,version:[1,0,0]}],...(dep?{dependencies:[{uuid:dep,version:[1,0,0]}]}:{})},null,2);
  F['RP/manifest.json']=mf('resources',uRP,crypto.randomUUID());F['BP/manifest.json']=mf('data',uBP,crypto.randomUUID(),uRP);
  log('Manifests generated for '+v);P();
  const bin=[];const terrain={},itemtex={};
  // textures
  const cp=async(src,dst)=>{bin.push([dst,await jar.file(src).async('uint8array')])};
  for(const[src,,r]of a.tex.block){const b=san(r.replace(/^textures\/block\//,'').replace(/\.png$/,''));await cp(src,`RP/textures/blocks/${ns}_${b}.png`);terrain[`${ns}_${b}`]={textures:`textures/blocks/${ns}_${b}`}}
  for(const[src,,r]of a.tex.item){const b=san(r.replace(/^textures\/item\//,'').replace(/\.png$/,''));await cp(src,`RP/textures/items/${ns}_${b}.png`);itemtex[`${ns}_${b}`]={textures:`textures/items/${ns}_${b}`}}
  for(const[src,,r]of a.tex.entity)await cp(src,'RP/textures/entity/'+ns+'/'+san(r.replace(/^textures\/entity\//,'')).replace(/\.png$/,'')+'.png');
  F['RP/textures/terrain_texture.json']=JSON.stringify({resource_pack_name:ns,texture_name:'atlas.terrain',padding:8,num_mip_levels:4,texture_data:terrain},null,2);
  F['RP/textures/item_texture.json']=JSON.stringify({resource_pack_name:ns,texture_name:'atlas.items',texture_data:itemtex},null,2);
  log(`Textures copied: ${a.tex.block.length} block, ${a.tex.item.length} item, ${a.tex.entity.length} entity`);P();
  // animated textures
  const fl=[];for(const[src,,r]of a.tex.block){const mc=await rj(src+'.mcmeta');if(mc?.animation){const b=san(r.replace(/^textures\/block\//,'').replace(/\.png$/,''));fl.push({flipbook_texture:`textures/blocks/${ns}_${b}`,atlas_tile:`${ns}_${b}`,ticks_per_frame:mc.animation.frametime||1})}}
  if(fl.length){F['RP/textures/flipbook_textures.json']=JSON.stringify(fl,null,2);rep.ok.push(fl.length+' animated textures → flipbook')}
  // blocks
  const lg={},bj={};
  for(const b of a.blocks){const tex=terrain[`${ns}_${san(b)}`]?`${ns}_${san(b)}`:null;if(!tex){rep.bad.push(`Block ${b}: no matching texture (name mismatch), skipped`);continue}
    const lootP=a.loot.find(l=>l.endsWith(`/blocks/${b}.json`)),c={'minecraft:destructible_by_mining':{seconds_to_destroy:2},'minecraft:friction':0.6};
    if(n>=vn('1.20.80')){c['minecraft:material_instances']={'*':{texture:tex,render_method:'opaque'}};c['minecraft:geometry']='minecraft:geometry.full_block';F[`BP/blocks/${san(b)}.json`]=JSON.stringify({format_version:'1.20.80','minecraft:block':{description:{identifier:id(b),menu_category:{category:'construction'}},components:c}},null,2)}
    else{delete c['minecraft:destructible_by_mining'];c['minecraft:destroy_time']=2;bj[id(b)]={textures:tex,sound:'stone'};F[`BP/blocks/${san(b)}.json`]=JSON.stringify({format_version:'1.16.100','minecraft:block':{description:{identifier:id(b),register_to_creative_menu:true},components:c}},null,2)}
    lg[`tile.${id(b)}.name`]=a.lang[`block.${a.ns0}.${b}`];rep.part.push(`Block ${b}: textured full cube, default hardness (real values live in Java code)`);
    if(lootP){const w=[];F[`BP/loot_tables/blocks/${san(b)}.json`]=JSON.stringify(mapLoot(await rj(lootP),w),null,2);w.forEach(x=>rep.part.push(`Loot ${b}: ${x}`))}}
  if(n<vn('1.20.80')&&a.blocks.length)F['RP/blocks.json']=JSON.stringify({format_version:[1,1,0],...bj},null,2);
  P();log(`Blocks converted: ${Object.keys(lg).length}/${a.blocks.length}`);
  // items
  let ni=0;for(const i of a.items){const t=`${ns}_${san(i)}`;if(!itemtex[t]){rep.bad.push(`Item ${i}: no matching texture, skipped`);continue}ni++;
    const mod=n>=vn('1.20.50');F[`BP/items/${san(i)}.json`]=JSON.stringify(mod?{format_version:'1.20.50','minecraft:item':{description:{identifier:id(i),menu_category:{category:'items'}},components:{'minecraft:icon':{textures:{default:t}},'minecraft:max_stack_size':64}}}:{format_version:'1.16.100','minecraft:item':{description:{identifier:id(i),category:'items'},components:{'minecraft:icon':t,'minecraft:max_stack_size':64}}},null,2);
    lg[`item.${id(i)}`]=a.lang[`item.${a.ns0}.${i}`];rep.part.push(`Item ${i}: icon + stack size only (behavior is Java code)`)}
  P();log('Items converted: '+ni);
  // recipes
  let nr=0;for(const r of a.recipes){const j=await rj(r);if(!j)continue;const t=(j.type||'').replace('minecraft:',''),nmr=san(r.split('/').pop().replace('.json','')),res=j.result;const ing=x=>{const k=Array.isArray(x)?x[0]:x;return k.tag?{tag:k.tag}:{item:mapId(k)}};const rid=id('r_'+nmr);let o;
    try{if(t==='crafting_shaped'){const key={};for(const[k,v]of Object.entries(j.key))key[k]=ing(v);o={'minecraft:recipe_shaped':{description:{identifier:rid},tags:['crafting_table'],pattern:j.pattern,key,result:{item:mapId(res),count:res.count||1}}}}
      else if(t==='crafting_shapeless'){o={'minecraft:recipe_shapeless':{description:{identifier:rid},tags:['crafting_table'],ingredients:j.ingredients.map(ing),result:{item:mapId(res),count:res.count||1}}}}
      else if(t==='smelting'){o={'minecraft:recipe_furnace':{description:{identifier:rid},tags:['furnace'],input:mapId(Array.isArray(j.ingredient)?j.ingredient[0]:j.ingredient)||ing(j.ingredient).tag,output:mapId(res)}}}
      else{rep.bad.push(`Recipe ${nmr}: type ${t} unsupported`);continue}
      F[`BP/recipes/${nmr}.json`]=JSON.stringify({format_version:'1.20.10',...o},null,2);nr++}catch(e){rep.bad.push(`Recipe ${nmr}: malformed (${e.message})`)}}
  if(nr)rep.part.push(`${nr} recipes converted (vanilla item names are not verified against Bedrock)`);P();log('Recipes: '+nr);
  // sounds
  const sd={};for(const s of a.sounds){const p=s.replace(/^assets\/[^/]+\/sounds\//,'').replace(/\.ogg$/,'');const q=san(p);bin.push([`RP/sounds/${ns}/${q}.ogg`,await jar.file(s).async('uint8array')]);sd[`${ns}.${q.replace(/\//g,'.')}`]={category:'neutral',sounds:[{name:`sounds/${ns}/${q}`}]}}
  if(a.sounds.length){F['RP/sounds/sound_definitions.json']=JSON.stringify({format_version:'1.14.0',sound_definitions:sd},null,2);rep.part.push(a.sounds.length+' sounds copied as definitions; event mapping (sounds.json) not translated')}
  // lang
  const L=Object.entries(lg).filter(e=>e[1]).map(e=>e.join('=')).join('\n');if(L){F['RP/texts/en_US.lang']=L;F['RP/texts/languages.json']='["en_US"]'}
  // unsupported
  if(a.entities.length)rep.bad.push(`Entities (${a.entities.join(', ')}): textures copied only; models/AI/behavior are Java code and need manual rewrite`);
  if(a.particles.length)rep.bad.push(a.particles.length+' particle definitions: Java format differs, not converted');
  for(const f of Object.keys(a.flags))rep.bad.push(`${f} detected: needs manual rewrite (Bedrock script API / behavior JSON)`);
  rep.bad.push('Custom (non-cube) block/item models, GUIs, and all Java gameplay logic are not converted');
  P();
  const V=validate(F,v);V.w.forEach(x=>log(x[1],x[0]));log(V.bad?V.bad+' validation errors':'Validation passed',V.bad?'er':'ok');
  return{F,bin,rep,V,nm}}
async function pack(r,fmt){const z=new JSZip(),pre=fmt==='mcaddon'?null:fmt.toUpperCase()+'/';
  const put=(p,d)=>{if(fmt==='mcaddon'){z.file(p.replace(/^(BP|RP)\//,(m,k)=>`${r.nm}_${k}/`),d)}else if(p.startsWith(pre))z.file(p.slice(3),d)};
  Object.entries(r.F).forEach(([p,d])=>put(p,d));r.bin.forEach(([p,d])=>put(p,d));
  if(!Object.keys(z.files).length)throw new Error('Nothing to package for this output type');
  return z.generateAsync({type:'uint8array',compression:'DEFLATE'},m=>prog(70+m.percent*.3))}
// ---- UI ----
const esc=s=>String(s).replace(/</g,'&lt;');
function showRep(a){$('#analysis').hidden=false;$('#report').innerHTML=`<p><b>${esc(a.name||a.ns0)}</b> ${esc(a.version)}<br>Loader: ${a.loader} · MC: ${esc(a.mc||'unknown')}</p><p>Blocks ${a.blocks.length} · Items ${a.items.length} · Entities ${a.entities.length}<br>Textures ${a.tex.block.length+a.tex.item.length+a.tex.entity.length} · Recipes ${a.recipes.length} · Loot ${a.loot.length} · Sounds ${a.sounds.length}<br>Java classes ${a.classes} · Deps: ${a.deps.join(', ')||'none'}</p>${Object.keys(a.flags).map(f=>`<div class="wn">Incompatible: ${f}</div>`).join('')}${a.warn.map(w=>`<div class="er">${w}</div>`).join('')}`}
let jar_name='';
$('#pick').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;jar_name=f.name;$('#sel').textContent=`${f.name} (${(f.size/1048576).toFixed(2)} MB)`;$('#log').innerHTML='';logs=[];out=null;$('#exp').hidden=true;
  try{prog(0);log('Analyzing…');az=await analyze(f);showRep(az);$('#go').disabled=!(az.blocks.length||az.items.length||az.tex.block.length||az.tex.item.length);
    const d=DB.get();cur={id:Date.now(),name:az.name||f.name,jar:f.name,loader:az.loader,created:new Date().toLocaleString(),exports:[],errors:[],analysis:$('#report').innerHTML};d.p.unshift(cur);DB.set(d);log('Analysis complete','ok')}
  catch(err){az=null;$('#go').disabled=true;log('Not a valid JAR/ZIP: '+err.message,'er')}};
$('#go').onclick=async()=>{$('#go').disabled=true;$('#log').innerHTML='';try{out=await convert(az,target,{name:$('#pname').value});
  const{rep}=out;log(`<b>Report</b>: ${rep.part.length} partial, ${rep.bad.length} unsupported`);rep.bad.forEach(x=>log('✗ '+esc(x),'er'));rep.part.forEach(x=>log('~ '+esc(x),'wn'));
  if(out.V.bad)throw new Error('Validation failed, no add-on generated');
  const fmt=$('#fmt').value;out.data=await pack(out,fmt);out.ext=fmt==='mcaddon'?'mcaddon':'mcpack';prog(100);log(`Packaged ${(out.data.length/1024).toFixed(1)} KB .${out.ext}`,'ok');$('#exp').hidden=false;
  if(cur){cur.errors=rep.bad;const d=DB.get(),p=d.p.find(x=>x.id===cur.id);if(p){p.errors=rep.bad;p.log=logs;DB.set(d)}}}
  catch(e){log('Conversion failed: '+esc(e.message),'er')}$('#go').disabled=false};
$('#exp').onclick=async()=>{const fn=`${out.nm}.${out.ext}`,C=window.Capacitor?.Plugins;try{
  if(C?.Filesystem&&C?.Share){let s='';for(let i=0;i<out.data.length;i+=8192)s+=String.fromCharCode.apply(null,out.data.subarray(i,i+8192));
    const r=await C.Filesystem.writeFile({path:fn,data:btoa(s),directory:'CACHE'});await C.Share.share({title:fn,url:r.uri})}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([out.data]));a.download=fn;a.click()}
  const d=DB.get();d.h.unshift({file:fn,size:out.data.length,ver:target,time:new Date().toLocaleString()});const p=d.p.find(x=>cur&&x.id===cur.id);if(p)p.exports.push(fn);DB.set(d);log('Exported '+fn,'ok')}catch(e){log('Export failed: '+esc(e.message),'er')}};
// version sheet
const rv=q=>{let l=VERS.filter(v=>v.includes(q));if(/^\d+\.\d+\.\d+$/.test(q)&&!VERS.includes(q))l=[q+' (custom)'].concat(l);$('#vl').innerHTML=l.map(v=>`<div class="vi" data-v="${v.split(' ')[0]}"><span>${v}</span><span>${v==target?'✓':''}</span></div>`).join('')||'<p class="muted">No match</p>'};
const setV=()=>$('#vbtn').textContent='Bedrock '+target;setV();
$('#vbtn').onclick=()=>{$('#sheet').hidden=false;$('#vq').value='';rv('')};$('#vx').onclick=()=>$('#sheet').hidden=true;$('#vq').oninput=e=>rv(e.target.value.trim());
$('#vl').onclick=e=>{const i=e.target.closest('.vi');if(i){target=i.dataset.v;setV();$('#sheet').hidden=true}};
// projects/history/tabs
function render(){const d=DB.get();$('#plist').innerHTML=d.p.map(p=>`<div class="glass"><b>${esc(p.name)}</b><div class="muted">${esc(p.jar)} · ${p.loader} · ${p.created}</div><div class="muted">Exports: ${p.exports.length} · Unsupported: ${p.errors.length}</div><div class="row"><button data-a="o" data-i="${p.id}">Open</button><button data-a="r" data-i="${p.id}">Rename</button><button data-a="d" data-i="${p.id}">Delete</button></div></div>`).join('')||'<p class="muted">No projects yet. Choose a JAR on the Convert tab.</p>';
  $('#hlist').innerHTML=d.h.map(h=>`<div class="glass">${esc(h.file)}<div class="muted">${h.ver} · ${(h.size/1024).toFixed(1)} KB · ${h.time}</div></div>`).join('')||'<p class="muted">No exports yet.</p>'}
$('#plist').onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=DB.get(),p=d.p.find(x=>x.id==b.dataset.i);
  if(b.dataset.a==='d'&&confirm('Delete project?'))d.p=d.p.filter(x=>x!==p);if(b.dataset.a==='r'){const n=prompt('Project name',p.name);if(n)p.name=n}
  if(b.dataset.a==='o'){$('#analysis').hidden=false;$('#report').innerHTML=p.analysis;$('#log').innerHTML=(p.log||p.errors.map(x=>'✗ '+x)).map(x=>`<div>${esc(x)}</div>`).join('');$('#sel').textContent=p.jar+' (saved report; re-select the JAR to convert again)';tab('convert')}
  DB.set(d);render()};
$('#clr').onclick=()=>{const d=DB.get();d.p.forEach(p=>{p.errors=[];p.log=[]});DB.set(d);render()};
function tab(v){document.querySelectorAll('.view,.tabs a').forEach(e=>e.classList.remove('on'));$('#v-'+v).classList.add('on');document.querySelector(`.tabs [data-v=${v}]`).classList.add('on');render()}
document.querySelectorAll('.tabs a').forEach(a=>a.onclick=()=>tab(a.dataset.v));render();
