import { styled } from '@nextui-org/react';



export const ComponentWithStyle = styled('div', {
    height: '100%',
    'form': {
        height: "100%"
    },
    '.formContainer': {
        height: "100%",
        display: 'flex',
        justifyContent: 'space-between',
        flexDirection: 'column',
        "& label": {

        }
    },
    '.pdfUpload': {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        color: '$text',
        '& input': {
            fontSize: 12,
            color: '#C5C5C5',
        },
        '.pdfName': {
            color: '#757475',
            margin: 0,
        }
    },
    '.submitButton': {
        width: "100%",
        background: '$gradient',
        boxShadow: '',
        mb: "$2"
    },
});

export default ComponentWithStyle;
