import {describe,it,expect} from 'vitest';
import {parseContactCsv,csvCell,calendarText,foldCalendarLine} from './crm-import';
describe('CSV review and export',()=>{
 it('reads quoted commas, quotes, semicolons and multiline cells',()=>{expect(parseContactCsv('first_name,last_name,email,phone\r\n"Ana, Maria","Da ""Silva""",ana@example.test,"123\n456"').rows[0]).toEqual({first_name:'Ana, Maria',last_name:'Da "Silva"',email:'ana@example.test',phone:'123\n456'});expect(parseContactCsv('first_name;email\nAna;ana@example.test').errors).toEqual([]);});
 it('rejects broken quotes, columns and missing names',()=>{expect(parseContactCsv('first_name,email\n"Ana,ana@example.test').errors.length).toBe(1);expect(parseContactCsv('first_name,email\nAna,ana@example.test,extra').errors.length).toBe(1);expect(parseContactCsv('first_name,email\n,ana@example.test').rows).toEqual([]);});
 it('identifies duplicate emails without merging names',()=>{const result=parseContactCsv('first_name,email\nAna,ANA@example.test\nAna,ana@example.test\nAna,');expect(result.rows).toHaveLength(2);expect(result.errors[0]).toContain('e-mail repetido');});
 it('rejects malformed email and overlarge imports',()=>{expect(parseContactCsv('first_name,email\nAna,invalid').rows).toEqual([]);expect(parseContactCsv('first_name\n'+Array(501).fill('Ana').join('\n')).errors[0]).toContain('500');});
 it('neutralizes spreadsheet formula cells while retaining quoted delimiters',()=>{for(const value of ['=cmd()', '+SUM(1)', '-2+3', '@IMPORT', '  =1'])expect(csvCell(value)).toMatch(/^"'/);expect(csvCell('Ana "A", Silva')).toBe('"Ana ""A"", Silva"');});
});
describe('ICS export',()=>{
 it('uses UTC dates and escapes untrusted event text',()=>{const result=calendarText([{id:'abc',title:'Conversa\nBEGIN:VEVENT',body:'Pauta, itens; teste',due_date:'2026-09-06T10:00:00-03:00',end_date:null}]);expect(result).toContain('DTSTART:20260906T130000Z');expect(result).toContain('DTEND:20260906T133000Z');expect(result.match(/^BEGIN:VEVENT/gm)).toHaveLength(1);expect(result).toContain('SUMMARY:Conversa\\nBEGIN:VEVENT');expect(result).toContain('DESCRIPTION:Pauta\\, itens\\; teste');});
 it('folds UTF-8 at 75 octets without splitting characters',()=>{const text='SUMMARY:'+('Reunião 🧑 '.repeat(20));const folded=foldCalendarLine(text);for(const line of folded.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);expect(folded.replace(/\r\n /g,'')).toBe(text);});
 it('does not invent dates for undated activities',()=>{expect(calendarText([{id:'abc',title:'Sem prazo',body:null,due_date:null,end_date:null}])).not.toContain('BEGIN:VEVENT');});
});
