// W13.2 live teacher-харнесс (RPC/REST против прод). Полный цикл двухуровневой проверки + негатив + очистка.
// Запуск: node reports/w13_2/_live_teacher_harness.cjs
const fs=require('fs');
const _cfg=fs.readFileSync(require('path').join(__dirname,'../../app/config.js'),'utf8');
const URL=(_cfg.match(/url:\s*'(https:\/\/api[^']+)'/)||[])[1]||'https://api.ege-trainer.ru';
const ANON=(_cfg.match(/anonKey:\s*'([^']+)'/)||[])[1];
const T_EMAIL='anton.ermolaev.work@gmail.com', T_PASS='1324qwer2413';
const S_EMAIL='erantokha@mail.ru', S_PASS='1324qwer2413;;;';
const QID='13.trig.factor.46.1', TOPIC='13.trig.factor';

async function api(p,o={},t){
  const r=await fetch(`${URL}${p}`,{...o,headers:{apikey:ANON,'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{}),...(o.headers||{})}});
  let b; try{b=await r.json()}catch{b=null}
  return {status:r.status,body:b};
}
const login=(e,p)=>api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});
const rpc=(t,fn,a={})=>api(`/rest/v1/rpc/${fn}`,{method:'POST',body:JSON.stringify(a)},t);
const insert=(t,table,row)=>api(`/rest/v1/${table}`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)},t);
const del=(t,table,q)=>api(`/rest/v1/${table}?${q}`,{method:'DELETE',headers:{Prefer:'return=representation'}},t);
const L=(...a)=>console.log(...a);
const short=(x)=>{const s=JSON.stringify(x); return s&&s.length>300?s.slice(0,300)+'…':s;};

(async()=>{
  let createdLink=false, hwId=null, linkId=null, attemptId=null, Tid=null, Sid=null, Ttok=null, Stok=null;
  try{
    const tL=await login(T_EMAIL,T_PASS); Ttok=tL.body?.access_token; Tid=tL.body?.user?.id;
    const sL=await login(S_EMAIL,S_PASS); Stok=sL.body?.access_token; Sid=sL.body?.user?.id;
    L('LOGIN teacher:', tL.status, Tid?'ok '+Tid:short(tL.body));
    L('LOGIN student:', sL.status, Sid?'ok '+Sid:short(sL.body));
    if(!Ttok||!Stok){throw new Error('login failed');}

    // 0. consent
    const myT=await rpc(Stok,'list_my_teachers');
    const linked=Array.isArray(myT.body)&&myT.body.some(r=>r.teacher_id===Tid);
    L('\n[0] consent: ученик уже связан с anton?', linked);
    if(!linked){
      const inv=await rpc(Ttok,'teacher_invite_student',{p_email:S_EMAIL});
      L('   invite:',inv.status,short(inv.body));
      const inc=await rpc(Stok,'list_incoming_teacher_requests');
      const req=Array.isArray(inc.body)?inc.body.find(r=>(r.teacher_email||'').toLowerCase()===T_EMAIL):null;
      L('   incoming req:',inc.status,req?req.request_id:short(inc.body));
      if(req){const acc=await rpc(Stok,'respond_teacher_request',{p_request_id:req.request_id,p_accept:true});L('   accept:',acc.status,short(acc.body));createdLink=true;}
    }

    // 1. anton creates homework + link
    L('\n[1] anton создаёт ДЗ с №13');
    const spec={v:1,fixed:[{topic_id:TOPIC,question_id:QID}],generated:[],shuffle:false};
    const hw=await insert(Ttok,'homeworks',{owner_id:Tid,title:'QA_PROD W13.2 live',spec_json:spec,frozen_questions:[{topic_id:TOPIC,question_id:QID}],attempts_per_student:1,is_active:true});
    hwId=Array.isArray(hw.body)?hw.body[0]?.id:hw.body?.id; L('   homework:',hw.status, hwId||short(hw.body));
    const token=require('crypto').randomUUID();
    const lk=await insert(Ttok,'homework_links',{owner_id:Tid,homework_id:hwId,token,is_active:true});
    linkId=Array.isArray(lk.body)?lk.body[0]?.id:lk.body?.id; L('   link:',lk.status, linkId||short(lk.body));
    const asg=await rpc(Ttok,'assign_homework_to_student',{p_homework_id:hwId,p_student_id:Sid,p_token:token});
    L('   assign:',asg.status,short(asg.body));

    // 2. erantokha attempt
    L('\n[2] ученик стартует+сдаёт попытку');
    const st=await rpc(Stok,'start_homework_attempt',{p_token:token,p_student_name:'QA'});
    attemptId=Array.isArray(st.body)?st.body[0]?.attempt_id:st.body?.attempt_id; L('   start:',st.status, attemptId||short(st.body));
    const payload=[{topic_id:TOPIC,question_id:QID,difficulty:3,correct:false,time_ms:1000,chosen_text:'',normalized_text:'',correct_text:''}];
    const sub=await rpc(Stok,'submit_homework_attempt_v2',{p_attempt_id:attemptId,p_payload:payload,p_total:1,p_correct:0,p_duration_ms:1000});
    L('   submit:',sub.status,short(sub.body));

    // 3. self-score
    L('\n[3] ученик ставит самооценку self_score=1');
    const self=await rpc(Stok,'submit_part2_self_score_v1',{p_question_id:QID,p_self_score:1,p_hw_attempt_id:attemptId,p_source:'hw'});
    L('   self:',self.status,short(self.body));

    // 4. teacher confirm
    L('\n[4] учитель подтверждает teacher_score=2 (ПОЗИТИВ)');
    const conf=await rpc(Ttok,'confirm_part2_teacher_score_v1',{p_attempt_id:attemptId,p_question_id:QID,p_teacher_score:2});
    L('   confirm:',conf.status,short(conf.body));

    // 5. verify
    L('\n[5] проверка ревью (ученик читает своё)');
    const rev=await api(`/rest/v1/part2_attempt_reviews?hw_attempt_id=eq.${attemptId}&question_id=eq.${encodeURIComponent(QID)}&select=*`,{},Stok);
    const row=Array.isArray(rev.body)?rev.body[0]:null;
    L('   row:',rev.status,short(row));
    const ok = row && row.self_score===1 && row.teacher_score===2 && row.status==='teacher_confirmed' && row.teacher_id===Tid && !!row.reviewed_at;
    L('   ПОЗИТИВ:', ok?'PASS (self=1, teacher=2, teacher_confirmed, аудит teacher_id+reviewed_at)':'FAIL');

    // 6. negative
    L('\n[6] НЕГАТИВ-кейсы (гейт)');
    const neg1=await rpc(Stok,'confirm_part2_teacher_score_v1',{p_attempt_id:attemptId,p_question_id:QID,p_teacher_score:0});
    L('   ученик(не владелец) confirm:',neg1.status,short(neg1.body),'→',neg1.status>=400||neg1.body?.code?'ОТКАЗ ✓':'ПРОПУЩЕНО ✗');
    const neg2=await rpc(Ttok,'confirm_part2_teacher_score_v1',{p_attempt_id:'00000000-0000-0000-0000-000000000000',p_question_id:QID,p_teacher_score:1});
    L('   anton confirm чужой/левый attempt:',neg2.status,short(neg2.body),'→',neg2.status>=400||neg2.body?.code?'ОТКАЗ ✓':'ПРОПУЩЕНО ✗');
  }catch(e){L('ERROR:',e.message);}
  finally{
    L('\n[cleanup]');
    try{ if(hwId&&Ttok){ const d1=await del(Ttok,'homework_links',`homework_id=eq.${hwId}`); const d2=await del(Ttok,'homeworks',`id=eq.${hwId}`); L('   del link/hw:',d1.status,d2.status);} }catch(e){L('   cleanup hw err',e.message);}
    try{ if(createdLink&&Stok&&Tid){ const rv=await rpc(Stok,'revoke_my_teacher',{p_teacher_id:Tid}); L('   revoke consent (создан этим прогоном):',rv.status);} else L('   consent НЕ трогаю (был до прогона или не создан)'); }catch(e){L('   revoke err',e.message);}
    L('   NB: строка part2_attempt_reviews остаётся (нет DELETE-политики) — тестовый teacher_score у erantokha по attempt',attemptId);
  }
})();
