import { Configuration, OpenAIApi } from "openai"
import { OPEN_AI_TOKEN, OPEN_AI_BASEPATH } from "../constants/config"

export default function openAiInstance(apiKey = OPEN_AI_TOKEN) {
    const basePath = OPEN_AI_BASEPATH?.replace(/\/+$/, "")
    const openai_config = new Configuration({
        apiKey,
        basePath: basePath || undefined
    })
    return new OpenAIApi(openai_config)
}
