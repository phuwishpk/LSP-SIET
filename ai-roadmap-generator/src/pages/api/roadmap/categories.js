import { backendServices } from "@/backend/services/services";
import { POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, POCKETBASE_URL } from "@/shared/constants/config";
import cacheData from "memory-cache";

export default async function handler(req, res) {
    try {
        if (!POCKETBASE_URL || !POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
            return res.status(200).json({
                ok: true,
                data: {
                    page: 1,
                    perPage: 99,
                    totalItems: 0,
                    totalPages: 0,
                    items: []
                }
            })
        }

        const cacheKey = "roadmap/categories"
        let data = cacheData.get(cacheKey);
        if (data) {
            return res.status(200).json({
                ok: true,
                data
            })
        }
        data = await backendServices.getCategories();
        // cache
        const cacheTime = 1000 * 60 * 10; // 10 min cache
        cacheData.put(cacheKey, data, cacheTime);
        // 
        return res.status(200).json({
            ok: true,
            data
        })
    } catch (e) {
        return res.status(500).json({
            ok: false,
            message: e
        })
    }
}
