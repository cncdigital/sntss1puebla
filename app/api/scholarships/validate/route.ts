import { requireScholarshipOperator } from "../access";
import {
  scholarshipAccessErrorResponse,
  validateScholarshipCredential,
} from "../credential";

export async function POST(request: Request) {
  const operator = await requireScholarshipOperator(request);
  if (!operator)
    return Response.json(
      { error: "La sesión del lector venció o no tiene autorización. Ingresa nuevamente con la matrícula lectora." },
      { status: 401 },
    );
  const payload = (await request.json()) as {
    campaignId?: number;
    credentialToken?: string;
  };
  try {
    const result = await validateScholarshipCredential(
      Number(payload.campaignId || 0),
      payload.credentialToken || "",
    );
    return Response.json({ eligible: true, ...result });
  } catch (error) {
    return scholarshipAccessErrorResponse(error);
  }
}
