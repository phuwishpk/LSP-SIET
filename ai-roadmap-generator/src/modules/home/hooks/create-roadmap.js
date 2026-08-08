import { LINKS } from "@/shared/constants/links";
import makeUrl from "@/shared/helper/make-url";
import { useRouter } from "next/router";
import { useState } from "react";
import services from '../services';
import toast from "@/shared/components/toast";

const useCreateRoadmap = () => {
    const router = useRouter();
    const [status, setStatus] = useState('idle');

    const afterCreateRoadmap = (_id) => {
        const roadmapUrlPage = makeUrl(LINKS.ROADMAP, { id: _id });
        router.push(roadmapUrlPage);
    }

    const action = ({ token, textOrder, pdfFile }) => {
        setStatus('loading');
        services.createRoadmap({ token: token !== "" ? token : null, textOrder, pdfFile }).then(res => {
            setStatus('done');
            if (res.data?.warning) {
                toast.warning(res.data.warning);
            }
            afterCreateRoadmap(res.data.code);
        }).catch(err => {
            toast.error(err?.response?.data?.message || "Could not generate roadmap");
            setStatus('idle');
        })
    }

    return {
        action,
        status,
    }
}

export default useCreateRoadmap;
