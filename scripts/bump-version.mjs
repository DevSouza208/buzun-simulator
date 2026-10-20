import {readFileSync,writeFileSync} from "node:fs";
const file="public/data/version.json";
const current=JSON.parse(readFileSync(file,"utf8"));
const patch=Number(current.patch);
if(!Number.isSafeInteger(patch)||patch<0)throw Error("Invalid build patch version");
const next=patch+1;
const payload={
  version:"0.1."+next,
  series:"0.1",
  patch:next,
  description:"Versioned automatically after changes to main",
  source:"public/data/version.json"
};
writeFileSync(file,JSON.stringify(payload,null,2)+"\n");
console.log("Buzun build version:",current.version,"→",payload.version);
