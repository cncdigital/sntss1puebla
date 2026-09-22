import { env } from "cloudflare:workers";
import { cookieToken,requireReader } from "../auth";
export async function GET(request:Request){const reader=await requireReader(request);return reader?Response.json({reader}):Response.json({error:"Sesión no autorizada"},{status:401})}
export async function POST(){return Response.json({error:"Ingresa con una matrícula lectora autorizada por Administración"},{status:410})}
export async function DELETE(request:Request){const token=cookieToken(request);if(token)await env.DB.prepare("DELETE FROM reader_sessions WHERE token=?").bind(token).run();return new Response(null,{status:204,headers:{"set-cookie":"sntss_reader=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"}})}
