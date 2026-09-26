import { env } from "cloudflare:workers";
import { getPrivilege } from "../authz";
export function cookieToken(request:Request){return request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("sntss_reader="))?.slice(13)??""}
export async function requireReader(request:Request){
  const privilege=await getPrivilege(request);
  if(privilege?.canScan||privilege?.canAdmin)
    return {email:`matricula:${privilege.matricula}`,fullName:"Personal autorizado",facilities:privilege.facilities};
  const token=cookieToken(request);
  if(token){
    const reader=await env.DB.prepare("SELECT a.email,a.full_name AS fullName FROM reader_sessions s JOIN reader_accounts a ON a.email=s.reader_email WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP AND a.active=1").bind(token).first<{email:string;fullName:string}>();
    if(reader)return {...reader,facilities:["*"]};
  }
  return null;
}
