'use strict';
const $ = id => document.getElementById(id);
const names = {overview:['Trung tâm triển khai','Một nơi theo dõi lộ trình, bằng chứng và bước tiếp theo.'],roadmap:['Lộ trình triển khai','Từ catalog đến dữ liệu chuẩn hóa, Studio và chuyển nguồn.'],consumers:['Dữ liệu cho 7 module','Nguồn dùng chung, hợp đồng riêng và version theo từng run.'],workers:['Giao việc có giới hạn','Prompt CC và điều kiện mở từng gói thực thi.'],documents:['Data master workspace','Kiến trúc, quy trình, allowlist và bằng chứng hiện trạng.']};
const labels = {VERIFIED_ENGINEERING:'Đã kiểm tra kỹ thuật',READY_FOR_REVIEW:'Chờ review',IN_PROGRESS:'Đang thực hiện',NOT_STARTED:'Chưa thực hiện',BLOCKED:'Đang bị chặn',PENDING:'Chờ nghiệm thu',NOT_REQUESTED:'Chưa yêu cầu',ACCEPTED:'Owner đã chấp nhận'};
let active = 'overview';
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function link(text,path){const el=node('a',text);el.href='./'+path;el.target='_blank';el.rel='noopener';return el;}
function unavailable(reason){return node('span',reason,'disabled-link');}
function evidenceLink(e){return e.href?link(e.label+' ↗',e.href):unavailable(e.reason);}
function badge(text,kind){return node('span',text,'badge '+(kind||''));}
function when(value){const d=new Date(value);return Number.isNaN(d.valueOf())?'UNKNOWN':new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Saigon'}).format(d);}
function route(){active=location.hash.slice(1);if(!names[active])active='overview';for(const id of Object.keys(names))$(id).hidden=id!==active;for(const a of document.querySelectorAll('nav a')){const selected=a.hash==='#'+active;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}$('page-title').textContent=names[active][0];$('page-description').textContent=names[active][1];}
function selectCurrent(p){
  const running=p.tasks.find(t=>t.status==='IN_PROGRESS');
  if(running)return {id:running.id,title:running.title,text:running.next_action,prompt:null};
  const blocked=p.tasks.find(t=>t.status==='BLOCKED');
  if(blocked){
    const owner=p.workers.find(w=>w.id===blocked.worker_id);
    const prompt=owner&&(p.artifacts||[]).some(a=>a.path===owner.prompt)?owner.prompt:null;
    return {id:blocked.worker_id||blocked.id,title:blocked.title,text:blocked.next_action,prompt};
  }
  const worker=p.workers.find(w=>w.status==='PREPARED'&&p.tasks.some(t=>t.worker_id===w.id&&t.status==='NOT_STARTED'));
  if(worker)return {id:worker.id,title:worker.title,text:worker.gate,prompt:null};
  const waiting=p.tasks.find(t=>t.status==='READY_FOR_REVIEW'||t.acceptance==='PENDING');
  if(waiting)return {id:waiting.id,title:waiting.title,text:waiting.next_action,prompt:null};
  const future=p.tasks.find(t=>t.status==='NOT_STARTED');
  if(future)return {id:future.id,title:future.title,text:'Chưa có prompt được mở gate. '+future.next_action,prompt:null};
  return {id:'REVIEW',title:'Không có gói đang thực hiện',text:'Đối chiếu hồ sơ nghiệm thu và next scope với owner.',prompt:null};
}
function render(data){const p=data.project,s=data.summary;$('updated').textContent=when(p.updated_at);$('connection').textContent='Đóng băng · '+when(data.read_at);$('hash-label').textContent='Logic '+data.logic_hash.slice(0,16)+'…';
  $('summary').replaceChildren();
  for(const [label,value,note] of [['Gói đã kiểm tra kỹ thuật',s.technical_verified+' / '+s.total,'Theo bằng chứng trong hồ sơ'],['Owner đã nghiệm thu',s.accepted+' / '+s.total,'Tách riêng với kiểm tra kỹ thuật'],['Module đã chuyển V2',String(p.cutover_count||0),'Chỉ ghi nhận sau owner chấp nhận'],['CC đang chạy đã đăng ký',String(s.registered_workers_running),'Không quét job nghiên cứu toàn máy']]){const item=node('div',undefined,'metric');item.append(node('small',label),node('strong',value),node('p',note));$('summary').append(item);}
  const current=selectCurrent(p);$('current-tag').textContent=current.id;$('current').replaceChildren(node('h3',current.title),node('p',current.text));$('current-link').hidden=!current.prompt;if(current.prompt){$('current-link').href='/'+current.prompt;$('current-link').textContent='Mở prompt '+current.id+' ↗';}else $('current-link').removeAttribute('href');
  $('health').replaceChildren();
  for(const [k,v] of [['Monitor','FROZEN / OFFLINE · không API live'],['Worker dự án',s.registered_workers_running?'Có worker RUNNING trong bản ghi nguồn':'0 RUNNING trong bản ghi nguồn'],['Data import / cutover',p.data_stage||'Chưa thực hiện'],['ETA toàn dự án','UNKNOWN · chưa có pilot'],['State record',when(p.updated_at)]]){const row=node('div');row.append(node('dt',k),node('dd',v));$('health').append(row);}
  $('notices').replaceChildren(...p.notices.map(x=>node('li',x)));
  $('journal').replaceChildren(...p.events.slice().reverse().map(e=>{const row=node('li');const tm=node('time',when(e.at));tm.dateTime=e.at;row.append(tm,node('span',e.text));return row;}));
  $('task-rows').replaceChildren(...p.tasks.map(t=>{const tr=node('tr'),first=node('td');first.append(node('strong',t.id+' · '+t.title),node('small',t.scope));const state=node('td');state.append(badge(labels[t.status]||t.status,t.status==='VERIFIED_ENGINEERING'?'verified':t.status==='BLOCKED'?'blocked':'pending'),node('small',t.status,'source-state'));for(const e of t.evidence){state.append(node('br'),evidenceLink(e));}const accept=node('td');accept.append(badge(labels[t.acceptance],t.acceptance==='ACCEPTED'?'verified':'pending'),node('small',t.acceptance,'source-state'));tr.append(first,state,accept,node('td',t.depends_on.join(', ')||'—'),node('td',t.next_action));return tr;}));
  $('consumer-rows').replaceChildren(...p.consumers.map(c=>{const tr=node('tr'),first=node('td'),proof=node('td');first.append(node('strong',c.name),node('small','Original consumer relation · '+c.id));proof.append(badge(c.evidence_status,'pending'),node('p',c.limitation));tr.append(first,node('td',c.current),node('td',c.target),proof);return tr;}));
  $('worker-list').replaceChildren(...p.workers.map(w=>{const box=node('article',undefined,'worker'),desc=node('div');desc.append(node('h3',w.title),node('p',w.gate),unavailable('Prompt không xuất bản · payload thực thi chỉ lưu local. Trạng thái nguồn: '+w.status));box.append(node('div',w.id,'worker-id'),desc,badge(w.status==='PREPARED'?'Sẵn để anh giao':'Chờ gate',w.status==='PREPARED'?'pending':'blocked'));return box;}));
  $('document-list').replaceChildren(...p.artifacts.filter(a=>a.group==='document').map(a=>{const box=node('div',undefined,'document'),body=node('div');body.append(a.href?link(a.title,a.href):node('strong',a.title),node('span',a.href?'Governance document · sanitized':a.reason));box.append(body,node('span',a.href?'↗':'KHÔNG XUẤT BẢN'));return box;}));
}
async function loadSnapshot(){try{const response=await fetch('./snapshot.json',{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();if(data.snapshot_scope!=='OBSERVATION_OF_MONITOR_ONLY'||data.project.project_id!=='qrw-v2')throw new Error('Invalid snapshot');render(data);$('error').hidden=true;}catch(e){$('error').textContent='Không đọc được bản chụp đã lọc. '+e.message;$('error').hidden=false;$('connection').textContent='Snapshot unavailable';document.body.classList.add('stale');}}
window.addEventListener('hashchange',route);route();loadSnapshot();
