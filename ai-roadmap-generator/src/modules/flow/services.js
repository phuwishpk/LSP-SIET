import mainApi from "@/infrastructure/http-client-main";
import { FLOW_API } from "./constants";
import makeUrl from "@/shared/helper/make-url";
import { getWorkspaceToken } from "@/infrastructure/workspace-client";

class FlowService {
  getFlowData = (id) => {
    return new Promise((resolve, reject) => {
      // Forward the workspace JWT so the API route can read the durable copy
      // stored in Open Notebook rather than this process's memory cache.
      const token = getWorkspaceToken();
      mainApi
        .get(makeUrl(FLOW_API.GET_FLOW, { id: id}), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        .then((res) => {
          resolve(res.data);
        })
        .catch((err) => {
          reject(err);
        });
    });
  };
  likeRoadmap = (id) => {
    return new Promise((resolve, reject) => {
      mainApi
          .get(makeUrl(FLOW_API.LIKE_ROADMAP, { id: id}))
          .then((res) => {
            resolve(res.data);
          })
          .catch((err) => {
            reject(err);
          });
    });
  };
  disLikeRoadmap = (id) => {
    return new Promise((resolve, reject) => {
      mainApi
          .get(makeUrl(FLOW_API.DIS_LIKE_ROADMAP, { id: id}))
          .then((res) => {
            resolve(res.data);
          })
          .catch((err) => {
            reject(err);
          });
    });
  };
}

export default new FlowService();
