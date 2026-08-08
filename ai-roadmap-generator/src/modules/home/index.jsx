import {useEffect, useState} from "react";
import {Row, Grid, Spacer, Container} from "@nextui-org/react";
import ComponentWithStyle from "./styles";
import Logo from "@/shared/components/logo";
import FormNewRoadmap from "./components/form-new-roadmap";
import RecentRoadmap from "./components/recents";
import Categories from "@/modules/home/components/categories";
import Footer from "@/shared/components/footer";
import {fetchCurrentWorkspaceUser} from "@/infrastructure/workspace-client";

const Home = () => {
    const [isMounted, setIsMounted] = useState(false);
    const [workspaceUser, setWorkspaceUser] = useState(null);

    useEffect(() => {
        setIsMounted(true);
        fetchCurrentWorkspaceUser().then((user) => {
            if (user) setWorkspaceUser(user);
        });
    }, []);

    return (
        <ComponentWithStyle>
            <Spacer y={2}/>
            <Row justify={'center'}>
                <Logo size={"lg"}/>
            </Row>
            {workspaceUser && (
                <Container>
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#065f46',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        marginBottom: '0.5rem',
                    }}>
                        ✓ Signed in to KMITL AI Workspace as <strong>@{workspaceUser.username}</strong>.
                        Roadmaps are stored locally in PocketBase but your session is
                        shared across the workspace.
                    </div>
                </Container>
            )}
            <Spacer y={2}/>
            <Container>
                <Grid.Container className={'categories'}>
                    <Grid xs={12} sm={10} md={10} lg={8} xl={6} display="flex" direction="column" justify="center">
                        <Categories/>
                    </Grid>
                </Grid.Container>
                <Spacer y={1}/>
                <Grid.Container className={'content'}>
                    <Grid xs={12} sm={5} md={5} lg={4} xl={3} display="flex" justify="center">
                        <div className={'box'}>
                            {isMounted && <FormNewRoadmap/>}
                        </div>
                    </Grid>
                    <Grid xs={12} sm={5} md={5} lg={4} xl={3} display="flex" justify="center">
                        <div className={'box'}>
                            <RecentRoadmap/>
                        </div>
                    </Grid>
                </Grid.Container>
                <Footer/>
      {/*          <div className="gradient1" />
                <div className="gradient2" />*/}
            </Container>
        </ComponentWithStyle>
    )
};
export default Home;
