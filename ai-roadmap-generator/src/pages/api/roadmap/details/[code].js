import { backendServices } from "@/backend/services/services";
import { POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, POCKETBASE_URL } from "@/shared/constants/config";
import cacheData from "memory-cache";
import requestIp from 'request-ip'

export default async function handler(req, res) {
    const code = req.query.code;
    if (!code) {
        return res.status(400).json({
            ok: false,
            message: "code required"
        })
    }
    try {
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
                message: "roadmap not found in local cache"
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
