export interface ContactImportRow { first_name:string;last_name:string|null;email:string|null;phone:string|null }
/** RFC 4180 subset: quoted cells, escaped quotes and newlines, comma or semicolon. */
export function parseContactCsv(text:string):{rows:ContactImportRow[];errors:string[]} {
 if(text.length>2_000_000)return {rows:[],errors:['O arquivo deve ter até 2 MB.']};
 const source=text.replace(/^\uFEFF/,'');const firstLine=source.split(/\r?\n/)[0];const separator=firstLine.includes(';')?';':',';
 const raw:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(c===separator&&!quoted){row.push(cell.trim());cell='';}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))raw.push(row);row=[];cell='';}
 else cell+=c;}
 row.push(cell.trim());if(row.some(Boolean))raw.push(row);
 if(quoted)return {rows:[],errors:['Há aspas não fechadas no CSV.']};
 const headers=raw.shift()?.map(v=>v.toLowerCase())??[];
 if(!headers.includes('first_name'))return {rows:[],errors:['A primeira linha precisa incluir a coluna first_name. Use o modelo para preencher.']};
 if(raw.length>500)return {rows:[],errors:['Importe até 500 contatos por arquivo. Divida o arquivo e tente novamente.']};
 const rows:ContactImportRow[]=[],errors:string[]=[];const emails=new Set<string>();
 for(let index=0;index<raw.length;index++){const values=raw[index];if(values.length!==headers.length){errors.push(`Linha ${index+2}: o número de colunas não corresponde ao cabeçalho.`);continue;}const get=(key:string)=>values[headers.indexOf(key)]?.trim()??'';const first_name=get('first_name'),last_name=get('last_name'),email=get('email').toLowerCase(),phone=get('phone');
  if(!first_name||first_name.length>160){errors.push(`Linha ${index+2}: informe um nome com até 160 caracteres.`);continue;}
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){errors.push(`Linha ${index+2}: e-mail inválido.`);continue;}
  if(email&&emails.has(email)){errors.push(`Linha ${index+2}: e-mail repetido no arquivo.`);continue;}
  if(email)emails.add(email);rows.push({first_name,last_name:last_name||null,email:email||null,phone:phone||null});
 }
 if(!raw.length)errors.push('O arquivo não contém contatos.');
 return {rows,errors};
}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function downloadText(filename:string,text:string,type='text/csv;charset=utf-8') {const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function calendarText(activities:{id:string;title:string;due_date:string|null;end_date:string|null;body:string|null}[]){
 const escape=(v:string)=>v.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const stamp=(v:string)=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Empreende IA//CRM//PT-BR','CALSCALE:GREGORIAN'];
 for(const a of activities){if(!a.due_date||!Number.isFinite(Date.parse(a.due_date)))continue;lines.push('BEGIN:VEVENT',`UID:${a.id}@crm.empreende-ia`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(a.due_date)}`,`DTEND:${stamp(a.end_date??new Date(Date.parse(a.due_date)+30*60000).toISOString())}`,`SUMMARY:${escape(a.title)}`,`DESCRIPTION:${escape(a.body??'')}`,'END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(foldCalendarLine).join('\r\n')+'\r\n';
}

export function foldCalendarLine(line:string){let result="",current="",bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>75){result+=current+"\r\n";current=" ";bytes=1;}current+=char;bytes+=size;}return result+current;}
