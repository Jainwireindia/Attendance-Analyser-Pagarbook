// Minimal Google Apps Script services, backed by memory, to run Code.gs in node
const fs=require('fs'), vm=require('vm'), crypto=require('crypto'), http=require('http');
const files={}; const props={ADMIN_PASSWORD:'Admin@123'};
let folders=0;
const mkFile=(name,content)=>({name,content,trashed:false,getBlob:()=>({getDataAsString:()=>files[name].content}),setContent(c){files[name].content=c;},setTrashed(t){delete files[name];}});
const folder={getName:()=>'Attendance Analyser Data',getUrl:()=>'mock',getId:()=>'F1',
  getFilesByName:(n)=>{const a=files[n]?[files[n]]:[];let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]};},
  createFile:(n,c)=>{files[n]=mkFile(n,c);files[n].content=c;return files[n];}};
const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;}})},
  DriveApp:{getFolderById:()=>folder,createFolder:()=>{folders++;return folder;}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),sleep:()=>{},
    base64EncodeWebSafe:(x)=>Buffer.from(typeof x==='string'?x:Buffer.from(x.map(b=>b&255))).toString('base64url'),
    base64DecodeWebSafe:(s)=>Array.from(Buffer.from(s,'base64url')).map(b=>b>127?b-256:b),
    base64Encode:(x)=>Buffer.from(x.map(b=>b&255)).toString('base64'),
    newBlob:(bytes)=>({getDataAsString:()=>Buffer.from(bytes.map(b=>b&255)).toString('utf8')}),
    computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',k).update(v).digest()).map(b=>b>127?b-256:b),
    computeDigest:(alg,v)=>Array.from(crypto.createHash('sha256').update(v,'utf8').digest()).map(b=>b>127?b-256:b),
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'}},
  ContentService:{createTextOutput:(s)=>({s,setMimeType(){return this;}}),MimeType:{JSON:'json'}},
  Logger:{log:console.log}, console, Date, JSON, Math, String, Array, Object, Error,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2]||__dirname+'/../apps-script/Code.gs','utf8'),ctx);
const call=(body)=>JSON.parse(ctx.doPost({postData:{contents:body}}).s);
module.exports={call,files,props};
if(require.main===module){
  http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');
    if(req.method!=='POST'){res.end(JSON.stringify({ok:true}));return;}
    res.end(JSON.stringify(call(b)));});}).listen(8765,()=>console.log('mock on 8765'));
}
