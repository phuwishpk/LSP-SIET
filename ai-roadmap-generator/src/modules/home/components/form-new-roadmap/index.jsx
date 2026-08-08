import {useMemo, useState} from "react";
import ComponentWithStyle from "./styles";
import {Card, Loading, Text} from "@nextui-org/react";
import FormProvider from "@/shared/components/form/provider";
import TextField from "@/shared/components/form/text-field";
import TextareaField from "@/shared/components/form/textarea";
import Button from "@/shared/components/button";
import {OPEN_AI_TOKEN} from "@/shared/constants/config"
import WaitingProgress from "../progress";
import useCreateRoadmap from "@/modules/home/hooks/create-roadmap";


const examples = [
    "ex: how to learn to lucid dreaming",
    "ex: how to learn x",
    "ex: how to learn cook pizza",
    "ex: how to cook pizza",
    "ex: basic of math",
    "ex: how to be better person",
    "ex: how to keep hydrated",
    "ex: make good relationships",
    "ex: learn javascript",
    "ex: how to start meditation everyday",
    "ex: basic of mindfulness",
]


const FormNewRoadmap = () => {
    const hookCreateRoadmap = useCreateRoadmap();
    const [pdfFile, setPdfFile] = useState(null);
    const submitForm = (values) => {
        hookCreateRoadmap.action({textOrder: values.textOrder, token: values?.token, pdfFile})
    }
    const showToken = OPEN_AI_TOKEN != null
    const example = useMemo(() => examples[Math.floor(Math.random() * examples.length)], []);
    return (
        <ComponentWithStyle>
            <Card className="card">
                <Text size={16}>
                    Enter description for your roadmap in details
                </Text>
                <FormProvider
                    returnToParent={false}
                    defaultValues={{token: null, textOrder: ''}}
                    onSubmit={async (values) => {
                        submitForm(values);
                    }}
                >
                    <div className="formContainer">
                        {
                            showToken &&
                            <TextField
                                key="token"
                                type={'token'}
                                label="token"
                                fullWidth
                                clearable
                                bordered
                                name="token"
                            />
                        }
                        <TextareaField
                            rows={6}
                            placeholder={example}
                            key="description"
                            type={'text'}
                            label="description"
                            fullWidth
                            clearable
                            bordered
                            name="textOrder"
                        />
                        <label className="pdfUpload">
                            <Text size={14}>PDF context</Text>
                            <input
                                accept="application/pdf"
                                type="file"
                                onChange={(event) => {
                                    setPdfFile(event.target.files?.[0] || null);
                                }}
                            />
                            {pdfFile &&
                                <Text size={12} className="pdfName">
                                    {pdfFile.name}
                                </Text>
                            }
                        </label>
                        <div>
                            <Button
                                className="submitButton"
                                size={"lg"}
                                disabled={hookCreateRoadmap.status === 'loading'}
                                type="submit"
                            >
                                {hookCreateRoadmap.status === 'loading' &&
                                    <Loading type="points" color="currentColor" size="sm"/>
                                }
                                {hookCreateRoadmap.status !== 'loading' &&
                                    <>Generate</>
                                }
                            </Button>
                            {
                                hookCreateRoadmap.status === "loading" &&
                                <WaitingProgress wait={60 * 1.5}/> // min
                            }
                        </div>
                    </div>
                </FormProvider>
            </Card>
        </ComponentWithStyle>
    )
};
export default FormNewRoadmap;
