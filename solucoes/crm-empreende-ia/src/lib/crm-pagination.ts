export async function allCrmRows<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>) {
 const rows:T[]=[]; const size=500;
 for(let from=0;;from+=size) { const {data,error}=await fetchPage(from,from+size-1);if(error)throw error;rows.push(...(data??[]));if(!data||data.length<size)return rows; }
}
