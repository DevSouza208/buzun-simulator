import {readdirSync} from "node:fs";
import {execFileSync} from "node:child_process";
for(const folder of ["src","scripts","tests"]){
  for(const file of readdirSync(folder)){
    if(!/\.(?:js|mjs)$/.test(file))continue;
    const target=folder+"/"+file;
    execFileSync(process.execPath,["--check",target],{stdio:"pipe"});
    console.log("Syntax OK:",target);
  }
}
