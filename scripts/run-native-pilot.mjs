// Opt-in paid synthetic integration pilot. Raw sessions remain in ignored local output.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const output=path.resolve(process.env.DSH_NATIVE_OUTPUT ?? path.join(root,'.tmp',`native-pilot-${Date.now()}`))
const spec=JSON.parse(fs.readFileSync(path.join(root,'fixtures/native-pilot.json'),'utf8'))
const cli=process.env.DSH_CLI_PATH
assert.ok(cli, 'Set DSH_CLI_PATH to the official 0.1.3-alpha.2 CLI')
const credential=process.env.DSH_NATIVE_API_KEY
assert.ok(credential, 'Set DSH_NATIVE_API_KEY in the process environment; it is never saved')
const provider={
 api:'anthropic-messages',
 baseURL:process.env.DSH_NATIVE_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/compatible',
 apiKeyEnv:'DSH_NATIVE_API_KEY',
 models:[{id:spec.model,name:'DeepSeek V4 Flash',maxTokens:spec.limits.maxTokensPerRequest,reasoningEfforts:false}],
 retryPolicy:{mode:'normal',maxRetries:0},
}
fs.mkdirSync(output,{recursive:true,mode:0o700})
assert.equal(fs.existsSync(path.join(output,'results.json')),false,'Choose a new output directory; never overwrite a previous run')
fs.writeFileSync(path.join(output,'preregistration.json'),JSON.stringify(spec,null,2)+'\n')
const sessionRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'dsh-learning-value-')))
const report={schemaVersion:1,startedAt:new Date().toISOString(),spec,arms:[],providerBill:'UNPROVEN',sessionRootRemoved:false}
function clean(value) {
 let text=typeof value==='string'?value:JSON.stringify(value)
 for(const [from,to] of [[credential,'$REDACTED_CREDENTIAL'],[sessionRoot,'$DISPOSABLE_ROOT'],[root,'$BUNDLE_ROOT'],[path.dirname(path.dirname(path.dirname(path.dirname(cli)))),'$DSH_TOOLS'],[process.execPath,'$NODE']]) text=text.replaceAll(from,to)
 return typeof value==='string'?text:JSON.parse(text)
}
function save(){fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(clean(report),null,2)+'\n')}
function invoke(executable,args,env,cwd= root) {
 const start=performance.now()
 const result=spawnSync(executable,args,{cwd,env,encoding:'utf8',timeout:spec.limits.timeoutMsPerSession,maxBuffer:8*1024*1024})
 return {argv:[executable,...args],status:result.status,signal:result.signal,error:result.error?.code??null,wallMs:Math.round(performance.now()-start),stdout:result.stdout??'',stderr:result.stderr??''}
}
function allFiles(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?allFiles(path.join(dir,e.name)):[path.join(dir,e.name)])}
function workspaceSnapshot(dir){return allFiles(dir).filter(f=>!f.includes('/.git/')).map(file=>({file:path.relative(dir,file),text:fs.readFileSync(file,'utf8')}))}
function readSession(home,before) {
 const paths=allFiles(path.join(home,'sessions')).filter(f=>(/session(?:\.v2)?\.jsonl\.zstd$/).test(f)&&!before.has(f))
 assert.equal(paths.length,1,'Expected exactly one new durable DSH session')
 const decoded=spawnSync('zstdcat',[paths[0]],{encoding:'utf8',maxBuffer:16*1024*1024})
 assert.equal(decoded.status,0,decoded.stderr)
 const lines=decoded.stdout.trim().split('\n').filter(Boolean).map(l=>JSON.parse(l))
 const archive=path.join(output,'private-sessions',path.basename(path.dirname(home)))
 fs.mkdirSync(archive,{recursive:true,mode:0o700})
 fs.copyFileSync(paths[0],path.join(archive,path.basename(path.dirname(paths[0]))+'.jsonl.zstd'))
 const messages=lines.filter(e=>e.type==='assistant/message')
 const selected=lines.filter(e=>['user/message','assistant/message','assistant/attempt','tool/call','tool/result','turn/end','request/header','step/end'].includes(e.type))
 return {path:paths[0],events:lines.length,assistantMessages:messages.length,
  usage:messages.map(e=>e.data?.message?.usage??e.data?.usage??null),
  injections:lines.filter(e=>e.type==='user/message'&&e.data?.source?.kind==='dsh-learning-recall').map(e=>e.data),
  toolCalls:lines.filter(e=>e.type==='tool/call').map(e=>e.data),
  selectedEvents:selected}
}
function runTask(arm,id,prompt){
 const before=new Set(allFiles(path.join(arm.home,'sessions')))
 const result=invoke(process.execPath,[cli,'--profile','headless',prompt],arm.env,arm.workspace)
 let session
 try{session=readSession(arm.home,before)}catch(e){session={readError:e.message}}
 const record={id,prompt,inputCharacters:[...prompt].length,...result,outputCharacters:[...result.stdout.trim()].length,session,workspace:workspaceSnapshot(arm.workspace),store:fs.existsSync(arm.store)?JSON.parse(fs.readFileSync(arm.store,'utf8')):null}
 arm.record.runs.push(record);save()
 const used=report.arms.flatMap(a=>a.runs).flatMap(r=>r.session.usage??[]).reduce((n,u)=>n+(u?.totalTokens??0),0)
 if(used>spec.limits.maxAggregateReportedTokens)throw new Error('Reported-token budget reached; stop before any additional session')
 console.log(JSON.stringify(clean({arm:arm.id,id,status:result.status,wallMs:result.wallMs,answer:result.stdout.trim(),injections:session.injections?.length,usage:session.usage})))
 if(result.status!==0)throw new Error(`Infrastructure/host failure at ${arm.id}/${id}; retained evidence; stop batch`)
 return record
}
try {
 const hostVersion=invoke(process.execPath,[cli,'--version'],{PATH:process.env.PATH,HOME:sessionRoot})
 assert.equal(hostVersion.status,0,hostVersion.stderr)
 assert.equal(hostVersion.stdout.trim(),'0.1.3-alpha.2','This frozen pilot targets one host release')
 report.dshVersion=hostVersion.stdout.trim()
 report.dshVersionEvidence='CLI --version before model calls'
 const pack=invoke('npm',['pack','--json','--pack-destination',sessionRoot],{PATH:process.env.PATH,HOME:sessionRoot})
 assert.equal(pack.status,0,pack.stderr)
 const tarball=path.join(sessionRoot,JSON.parse(pack.stdout)[0].filename)
 report.pack=pack
 for(const armSpec of spec.arms){
  const base=path.join(sessionRoot,armSpec.id),home=path.join(base,'home'),workspace=path.join(base,'workspace'),store=path.join(home,'learning.json')
  fs.mkdirSync(home,{recursive:true});fs.mkdirSync(workspace,{recursive:true})
  fs.writeFileSync(path.join(workspace,'package.json'),JSON.stringify({name:'team-notes',version:'1.0.0',private:true,type:'module',scripts:{test:'node --test'}})+'\n')
  fs.writeFileSync(path.join(workspace,'README.md'),'# Team Notes\n\nA small JavaScript project.\n')
  fs.writeFileSync(path.join(workspace,'AGENTS.md'),'Keep functions dependency-free.\n')
  fs.writeFileSync(path.join(workspace,'index.js'),"export function greet(name) { return 'Hello ' + (name ?? 'stranger') }\n")
  fs.writeFileSync(path.join(workspace,'index.test.js'),"import test from 'node:test'; import assert from 'node:assert/strict'; import { greet } from './index.js';\ntest('existing callers', () => { assert.equal(greet('Ada'), 'Hello Ada'); assert.equal(greet(null), 'Hello stranger'); assert.equal(greet(), 'Hello stranger') });\n")
  fs.writeFileSync(path.join(home,'settings.yaml'),JSON.stringify({'agent-default-model':{provider:'volcengine-payg',model:spec.model},'llm-pi-ai':{providers:{'volcengine-payg':provider}}}))
  const env={PATH:process.env.PATH,HOME:home,DSH_HOME:home,DSH_LEARNING_STORE:store,[provider.apiKeyEnv]:credential}
  const record={id:armSpec.id,setup:[],runs:[]};report.arms.push(record)
  const arm={id:armSpec.id,home,workspace,store,env,record}
  if(arm.id.startsWith('bundle-')){
   const installed=invoke(process.execPath,[cli,'plugin','--profile','headless','add','-w',tarball],env,workspace)
   record.setup.push({kind:'plugin-install',...installed});save();assert.equal(installed.status,0,installed.stderr)
  }
  if(arm.id.endsWith('-natural'))runTask(arm,'teaching',spec.teaching)
  record.afterSetup={workspace:workspaceSnapshot(workspace),store:fs.existsSync(store)?JSON.parse(fs.readFileSync(store,'utf8')):null};save()
  for(const task of spec.tasks) {
   runTask(arm,task.id,task.prompt)
   if(task.id==='artifact') {
    const check=invoke(process.execPath,['--input-type=module','-e',"import assert from 'node:assert/strict'; import {greet} from './index.js'; assert.equal(greet('Ada'),'Hello Ada'); assert.equal(greet(null),'Hello stranger'); assert.equal(greet(),'Hello stranger'); assert.equal(greet('Ada',{uppercase:true}),'HELLO ADA');"],env,workspace)
    record.artifactCheck=check; save()
   }
  }
 }
 report.status='COMPLETED'
} catch(error){report.status='STOPPED';report.error=clean(error.message);process.exitCode=1;console.error(report.error)}
finally {fs.rmSync(sessionRoot,{recursive:true,force:true});report.sessionRootRemoved=!fs.existsSync(sessionRoot);report.finishedAt=new Date().toISOString();save()}
