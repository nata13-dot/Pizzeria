import { useState, type ChangeEvent, type DragEvent } from "react";

type LogoPickerProps = {
  value: string;
  onChange: (dataUri: string) => void;
  onError: (message: string) => void;
  emptyLabel?: string;
  changeLabel?: string;
  maximumBytes?: number;
};

const allowedTypes = ["image/png", "image/jpeg"];

export function LogoPicker({ value, onChange, onError, emptyLabel = "Seleccionar o arrastrar imagen", changeLabel = "Cambiar imagen", maximumBytes = 5 * 1024 * 1024 }: LogoPickerProps) {
  const [dragging, setDragging] = useState(false);

  function read(file?: File) {
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      onError("Selecciona una imagen PNG o JPEG.");
      return;
    }
    if (file.size > maximumBytes) {
      onError(`La imagen supera el máximo permitido de ${maximumBytes / 1024 / 1024} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => onError("No fue posible leer la imagen seleccionada.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      onError("");
      onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    read(event.dataTransfer.files[0]);
  }

  return <div
    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => setDragging(false)}
    onDrop={drop}
    style={{
      alignItems: "center",
      background: dragging ? "#fff0ec" : "#f8f9fa",
      border: `2px dashed ${dragging ? "#d94f36" : "#cfd4da"}`,
      borderRadius: 14,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      justifyContent: "center",
      minHeight: 180,
      overflow: "hidden",
      padding: 18,
      position: "relative",
      textAlign: "center",
    }}
  >
    <input
      accept="image/png,image/jpeg"
      aria-label={value ? changeLabel : emptyLabel}
      onChange={(event: ChangeEvent<HTMLInputElement>) => { read(event.target.files?.[0]); event.target.value = ""; }}
      style={{ cursor: "pointer", inset: 0, opacity: 0, position: "absolute", width: "100%" }}
      type="file"
    />
    {value ? <img alt="Vista previa de la imagen" src={value} style={{ maxHeight: 105, maxWidth: "80%", objectFit: "contain" }} /> : <span style={{ fontSize: 30 }}>▧</span>}
    <strong>{value ? changeLabel : emptyLabel}</strong>
    <span style={{ color: "#747b85", fontSize: 13 }}>PNG o JPEG · máximo {maximumBytes / 1024 / 1024} MB</span>
  </div>;
}
