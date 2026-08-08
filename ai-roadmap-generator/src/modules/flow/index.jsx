import { useRouter } from "next/router";
import useGetFlow from './hooks/get-flow';
import { useEffect, useMemo, useState } from 'react';
import { Container, Loading, Row, Text } from "@nextui-org/react";
import DrawFlow from "./components/draw-flow";
import Header from "./components/header";
import Head from "next/head";

const Flow = () => {
  const hookFlow = useGetFlow();
  const { query } = useRouter();
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const flowId = query.id;
  useEffect(() => {
    if (flowId) {
      hookFlow.action(flowId)
    }
  }, [flowId]);
  const title = hookFlow?.data?.title;
  const flowData = useMemo(() => {
    if (typeof hookFlow?.data?.data !== "string") {
      return hookFlow?.data?.data || [];
    }

    try {
      return JSON.parse(hookFlow.data.data);
    } catch (_error) {
      return [];
    }
  }, [hookFlow?.data?.data]);

  return (
    <>
      {
        hookFlow.status === 'loading' &&
        <Container css={{ height: "100vh" }} justify="center" alignContent="center" display="flex">
          <Row justify={'center'} align={"center"}>
            <Text ht="bold" size={20}
              css={{
                textGradient: "$gradientText",
                marginRight: 12
              }}>
              wait for drawing
            </Text>
            <Loading color="secondary" size="sm" />
          </Row>
        </Container>
      }
      {
        hookFlow.status === 'done' &&
        <>
          <Head>
            <title>
              Ai Roadmap | {title}
            </title>

            <meta property="og:title" content={`Ai Roadmap : ${title}`} />
            <link rel="canonical" href={`https://ai-roadmap.com/roadmap/${flowId}`} />

          </Head>
          <Header reactFlowInstance={reactFlowInstance} data={hookFlow?.data} />
          <DrawFlow data={flowData} onInit={instance => {
            setReactFlowInstance(instance);
          }} />
        </>
      }
    </>
  )
};
export default Flow;
