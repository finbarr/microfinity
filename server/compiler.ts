import ts from 'typescript';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const sdkPath=resolve('sdk/index.ts');
// Existing immutable cartridges may still use the original namespace.
const isSDK=(name:string)=>name==='@microfinity/sdk'||name==='@minifinity/sdk';
const forbidden=new Set(['Date','setTimeout','setInterval','fetch','XMLHttpRequest','WebSocket','document','window','process','require','eval','Function','globalThis','AudioContext','Worker','SharedArrayBuffer','Atomics']);
export async function compile(source:string) {
  if(Buffer.byteLength(source)>100_000)throw new Error('Source exceeds 100 KB');
  const file=ts.createSourceFile('/cartridge.ts',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  function visit(node:ts.Node){
    if(ts.isImportDeclaration(node)&&(!ts.isStringLiteral(node.moduleSpecifier)||!isSDK(node.moduleSpecifier.text)))throw new Error('Only @microfinity/sdk imports are allowed');
    if(ts.isImportEqualsDeclaration(node)||ts.isExportDeclaration(node)&&node.moduleSpecifier)throw new Error('Unsupported module import/export');
    if(ts.isIdentifier(node)&&forbidden.has(node.text))throw new Error(`Unsupported API: ${node.text}`);
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)throw new Error('Dynamic imports are forbidden');
    if(ts.isPropertyAccessExpression(node)&&node.expression.getText(file)==='Math'&&node.name.text==='random')throw new Error('Use ctx.random instead of Math.random');
    ts.forEachChild(node,visit);
  }visit(file);
  for(const statement of file.statements)if(ts.isVariableStatement(statement)&&!(statement.declarationList.flags&ts.NodeFlags.Const))throw new Error('Module-level mutable state is forbidden; put it in init state');
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,noEmit:true,skipLibCheck:true,types:[],lib:['lib.es2022.d.ts']};
  const host=ts.createCompilerHost(options),originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host);
  host.fileExists=f=>f==='/cartridge.ts'||originalExists(f);host.readFile=f=>f==='/cartridge.ts'?source:originalRead(f);
  host.resolveModuleNames=names=>names.map(name=>isSDK(name)?{resolvedFileName:sdkPath,extension:ts.Extension.Ts}:undefined);
  const program=ts.createProgram(['/cartridge.ts'],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.length)throw new Error(diagnostics.slice(0,12).map(d=>{
    const pos=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):null;
    return `${pos?`${pos.line+1}:${pos.character+1} `:''}${ts.flattenDiagnosticMessageText(d.messageText,' ')}`;
  }).join('\n'));
  const built=await build({stdin:{contents:source,loader:'ts',sourcefile:'cartridge.ts',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'__cartridge',target:'es2020',plugins:[{name:'sdk-only',setup(b){b.onResolve({filter:/.*/},args=>isSDK(args.path)?{path:sdkPath}:{errors:[{text:'Unapproved import'}]});}}]});
  return built.outputFiles[0].text;
}
let cachedBootstrap:string|undefined;
export async function bootstrap() {
  if(!cachedBootstrap){
    try{if(process.env.NODE_ENV!=='production')throw new Error('Development runtime');cachedBootstrap=await readFile('dist/runtime/bootstrap.js','utf8');}
    catch {cachedBootstrap=(await build({entryPoints:['runtime/bootstrap.ts'],bundle:true,write:false,format:'iife',globalName:'__engine',target:'es2020'})).outputFiles[0].text;}
  }
  return cachedBootstrap;
}
