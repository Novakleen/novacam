import AnnotationEditor from './AnnotationEditor';

/** @deprecated Use AnnotationEditor. Kept so older imports still open the vector editor. */
const PhotoAnnotationCanvas = ({ photoDataUrl, onSave, onCancel }) => (
  <AnnotationEditor
    imageSrc={photoDataUrl}
    onCancel={onCancel}
    onSave={(payload) => onSave?.(payload.dataUrl)}
  />
);

export default PhotoAnnotationCanvas;
