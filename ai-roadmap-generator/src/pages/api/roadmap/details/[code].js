import { backendServices } from "@/backend/services/services";
import { POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, POCKETBASE_URL } from "@/shared/constants/config";
import cacheData from "memory-cache";
import requestIp from 'request-ip'

/**
 * Roadmaps generated through KMITL AI Workspace are stored as a
 * `roadmap_session` record in Open Notebook, and the view code is that record
 * id with ":" swapped for "-". Reading them back from there (instead of the
 * in-process memory cache) is what makes a shared plan survive a restart.
 */
const WORKSPACE_PREFIX = "roadmap_session-";

async function loadFromWorkspace(code, authorization) {
  const apiUrl = process.env.OPEN_NOTEBOOK_API_URL;
  if (!apiUrl || !authorization || !code.startsWith(WORKSPACE_PREFIX)) return null;
  const sessionId = code.replace(WORKSPACE_PREFIX, "roadmap_session:");
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/api/features/roadmap/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: authorization } }
    );
    if (!res.ok) return null;
    const session = await res.json();
    const nodes = session.nodes || [];
    const parentByTarget = new Map(
      (session.edges || []).map((edge) => [String(edge.target), String(edge.source)])
    );
    const indexById = new Map(nodes.map((node, index) => [String(node.id), index]));
    const roadmap = nodes.map((node, index) => ({
      id: index,
      level: index === 0 ? 0 : 1,
      parent: index === 0 ? 0 : indexById.get(parentByTarget.get(String(node.id))) ?? 0,
      title: node.label,
      description: node.description || "",
    }));
    return {
      code,
      session_id: session.id,
      title: session.title,
      data: JSON.stringify(roadmap),
      roadmap,
      created: session.created,
      likes: 0,
      is_liked: false,
    };
  } catch (error) {
    console.log("workspace roadmap lookup failed", error?.message || error);
    return null;
  }
}

export default async function handler(req, res) {
    const code = req.query.code;
    if (!code) {
        return res.status(400).json({
            ok: false,
            message: "code required"
        })
    }
    try {
        // A workspace roadmap belongs to one account, so it is always read
        // back from Open Notebook with that account's token - never from the
        // shared in-process cache, which anyone hitting this URL could read.
        if (code.startsWith(WORKSPACE_PREFIX)) {
            const fromWorkspace = await loadFromWorkspace(code, req.headers["authorization"]);
            if (fromWorkspace) {
                return res.status(200).json({ ok: true, data: fromWorkspace });
            }
            return res.status(404).json({
                ok: false,
                message: "ไม่พบแผนนี้ หรือคุณไม่มีสิทธิ์เปิดดู กรุณาเข้าสู่ระบบผ่าน SIET Space",
            });
        }

        if (!POCKETBASE_URL || !POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
            const data = cacheData.get(`roadmap/local/${code}`);
            if (data) {
                return res.status(200).json({
                    ok: true,
                    data
                })
            }

            return res.status(404).json({
                ok: false,
                message: "ไม่พบแผนนี้ — แผนที่สร้างแบบไม่ได้เข้าสู่ระบบจะหายเมื่อเซิร์ฟเวอร์รีสตาร์ต กรุณาเข้าผ่าน SIET Space เพื่อให้ระบบบันทึกให้ถาวร"
            })
        }

        const detectedIp = requestIp.getClientIp(req)
        const data = await backendServices.getRoadmapByCode({ code, client_ip: detectedIp }).catch(e => {
            return res.status(404).json({
                ok: false,
                message: e.message
            })
        })
        if (data?.collectionId) {
            return res.status(200).json({
                ok: true,
                data
            })
        }
    } catch (e) {
        return res.status(500).json({
            ok: false,
            message: e?.message
        })
    }
}
