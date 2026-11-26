const {call,files}=require('./mockgas');
const r=(o)=>call(JSON.stringify(o)); const A=require('assert');
let x=r({action:'login',username:'admin',password:'bad'}); A(!x.ok);
x=r({action:'login',username:'Admin',password:'Admin@123'}); A(x.ok); const at=x.token;
A(!r({action:'listUsers',token:at+'x'}).ok);
A(r({action:'saveUser',token:at,user:{username:'rajesh',name:'Rajesh',role:'supervisor',depts:['Loading'],password:'pass123'}}).ok);
A(r({action:'saveUser',token:at,user:{username:'office1',name:'Office',role:'office',password:'pass123'}}).ok);
A(!r({action:'saveUser',token:at,user:{username:'admin',role:'office',password:'pass123'}}).ok);
const sup=r({action:'login',username:'rajesh',password:'pass123'}).token, off=r({action:'login',username:'office1',password:'pass123'}).token;
A(!r({action:'listUsers',token:sup}).ok);
const iss=[{name:'A K',staffId:'L-1',department:'Loading',date:'2026-11-02',cat:'ot',issue:'Worked 13:00',action:'x'},
 {name:'B',staffId:'T1-1',department:'Team 1',date:'2026-11-03',cat:'abs',issue:'Absent',action:'y'},
 {name:'C',staffId:'L-2',department:'Loading',date:'',cat:'auto',issue:'none',action:'z',status:'Auto-Resolved'}];
A(!r({action:'savePeriod',token:sup,period:{start:'2026-11-01',end:'2026-11-14',issues:iss}}).ok);
x=r({action:'savePeriod',token:off,period:{start:'2026-11-01',end:'2026-11-14',sources:['a'],issues:iss}}); A(x.ok&&x.added===3,JSON.stringify(x));
let p=r({action:'getPeriod',token:sup,id:'2026-11-01_2026-11-14'}).period; A.equal(p.issues.length,2);
const ot=p.issues.find(i=>i.cat==='ot'), ab=r({action:'getPeriod',token:off,id:'2026-11-01_2026-11-14'}).period.issues.find(i=>i.cat==='abs');
A(!r({action:'updateIssue',token:sup,periodId:p.id,issueId:ab.id,solution:'x'}).ok,'other dept');
A(!r({action:'updateIssue',token:off,periodId:p.id,issueId:ot.id,done:true}).ok,'needs solution');
x=r({action:'updateIssue',token:sup,periodId:p.id,issueId:ot.id,solution:'OT approved'}); A(x.ok&&x.issue.status==='answered');
A(!r({action:'updateIssue',token:sup,periodId:p.id,issueId:ot.id,done:true}).ok,'sup cant tick');
x=r({action:'updateIssue',token:off,periodId:p.id,issueId:ot.id,done:true}); A(x.ok&&x.issue.status==='done');
const auto=r({action:'getPeriod',token:off,id:p.id}).period.issues.find(i=>i.auto);
A.equal(auto.status,'done');
let L=r({action:'listPeriods',token:sup}).periods; A.equal(L[0].counts.total,2); A.equal(L[0].counts.done,2);
L=r({action:'listPeriods',token:off}).periods; A.deepEqual(L[0].counts,{total:3,open:1,answered:0,done:2});
// re-upload: absent B fixed in pagarbook (gone), OT still there, new one added
x=r({action:'savePeriod',token:off,period:{start:'2026-11-01',end:'2026-11-14',issues:[iss[0],iss[2],{name:'D',staffId:'L-3',department:'Loading',date:'2026-11-04',cat:'half',issue:'h',action:'h'}]}});
A(x.ok&&x.added===1&&x.kept===2&&x.cleared===1,JSON.stringify(x));
p=r({action:'getPeriod',token:off,id:p.id}).period;
A.equal(p.issues.find(i=>i.cat==='ot').solution,'OT approved'); A.equal(p.issues.find(i=>i.cat==='ot').status,'done');
A.equal(p.issues.find(i=>i.cat==='abs').doneBy,'auto');
A(r({action:'changePassword',token:sup,oldPassword:'pass123',newPassword:'newpass1'}).ok);
A(!r({action:'login',username:'rajesh',password:'pass123'}).ok); A(r({action:'login',username:'rajesh',password:'newpass1'}).ok);
r({action:'saveUser',token:at,user:{username:'rajesh',name:'Rajesh',role:'supervisor',active:false}});
A(!r({action:'me',token:sup}).ok,'disabled user session revoked');
A(!r({action:'getPeriod',token:off,id:'../x'}).ok);
A(r({action:'deletePeriod',token:at,id:p.id}).ok); A.equal(r({action:'listPeriods',token:at}).periods.length,0);
console.log('API tests passed. files:',Object.keys(files), 'users.json has hash only:', !files['users.json'].content.includes('pass123'));
