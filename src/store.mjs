import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,statSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export function openStore(path,clock=Date.now){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, known_at REAL NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS memory(key TEXT PRIMARY KEY, body TEXT NOT NULL);');
 const get=db.prepare('SELECT * FROM records WHERE id=?'),insert=db.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?,?)'),all=db.prepare('SELECT * FROM records WHERE kind=? ORDER BY known_at,id'),kv=db.prepare('SELECT body FROM memory WHERE key=?'),put=db.prepare('INSERT INTO memory VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body');
 const decode=r=>r?{...JSON.parse(r.body),id:r.id,kind:r.kind,knownAt:r.known_at}:null;
 return{get:id=>decode(get.get(id)),all:kind=>all.all(kind).map(decode),add(id,kind,body){insert.run(id,kind,clock(),JSON.stringify(body));return decode(get.get(id));},memory(key,value){if(arguments.length===2){put.run(key,JSON.stringify(value));return value;}const r=kv.get(key);return r?JSON.parse(r.body):null;},transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},size:()=>[path,path+'-wal'].reduce((n,p)=>{try{return n+statSync(p).size}catch{return n}},0),checkpoint:()=>db.exec('PRAGMA wal_checkpoint(TRUNCATE)'),close:()=>{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}};
}
export function writeJson(file,body){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(body,null,2)+'\n');}
