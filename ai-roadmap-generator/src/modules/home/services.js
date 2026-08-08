import { HOME_API } from "./constants";
import mainApi from "@/infrastructure/http-client-main";

class HomeService {
  createRoadmap = ({token, textOrder, pdfFile}) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("title", textOrder);
      if (token) {
        formData.append("token", token);
      }
      if (pdfFile) {
        formData.append("pdf", pdfFile);
      }

      mainApi
        .post(HOME_API.CREATE_ROADMAP, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })
        .then((res) => {
          resolve(res.data);
        })
        .catch((err) => {
          reject(err);
        });
    });
  };
  getRecentRoadmapList = () => {
    return new Promise((resolve, reject) => {
      mainApi
          .post(HOME_API.GET_RECENT_ROADMAP_LIST)
          .then((res) => {
            resolve(res.data);
          })
          .catch((err) => {
            reject(err);
          });
    });
  };
}

export default new HomeService();
