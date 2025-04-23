declare module 'eu-eleysion-recogito-js' {
    export type RecogitoEvent =
        | 'createAnnotation'
        | 'deleteAnnotation'
        | 'selectAnnotation'
        | 'updateAnnotation';

    export class Recogito {
        constructor(options: RecogitoOptions);
        set disableSelect(select: boolean);

        addAnnotation: (annotation: Annotation) => void;
        removeAnnotation: (annotation: Annotation) => void;

        getAnnotations: () => Annotation[];
        setAnnotations(annotations: Annotation[]);
        clearAnnotations: () => void;
        destroy(): void;

        on(eventName: RecogitoEvent, callback: Function);
        off(eventName: RecogitoEvent, callback: Function);
    }

    export interface FormatterResult {
        className: string;
        style: string;
        [key: string]: string;
    }

    export interface RecogitoOptions {
        content: string | HTMLElement;
        locale: string; // TODO 'auto' and ??. undocumented
        allowEmpty?: boolean; // TODO confirm optional
        widgets?: any; // TODO confirm
        relationVocabulary?: Array<string>; // TODO confirm
        editorAutoPosition?: boolean;
        readOnly?: boolean;
        disableEditor?: boolean;
        formatter?: (annotation: Annotation) => string | FormatterResult;
        mode?: 'html' | 'pre';
    }

    export type AnnotationSelection =
        | AnnotationSelectionQuote
        | AnnotationSelectionPosition;

    export interface AnnotationSelectionQuote {
        type: 'TextQuoteSelector';
        exact: string;
    }

    export interface AnnotationSelectionPosition {
        type: 'TextPositionSelector';
        start: number;
        end: number;
    }

    export interface AnnotationBody {
        type: 'TextualBody';
        value: string;
        purpose: 'commenting' | 'tagging';
        created?: string;
        creator?: {
            id: string;
            name: string;
        };
    }

    export interface Annotation {
        id: string;
        context: string;
        type: string;
        body: AnnotationBody[];
        target: {
            selector: AnnotationSelection[];
        };
        level?: number;
    }
}
