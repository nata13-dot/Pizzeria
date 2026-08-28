import { useState, type ChangeEvent, type DragEvent } from "react";

type LogoPickerProps = {
  value: string;
  onChange: (dataUri: string) => void;
  onError: (message: string) => void;
};

const maximumBytes = 1024 * 1024;
const allowedTypes = ["image/png", "image/jpeg"];

export function LogoPicker({ value, onChange, onError }: LogoPickerProps) {
  const [dragging, setDragging] = useState(false);

  function read(file?: File) {
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      onError("Selecciona una imagen PNG o JPEG.");
      return;
    }
    if (file.size > maximumBytes) {
      onError("La imagen supera el máximo permitido de 1 MB.");
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
      aria-label="Seleccionar logo"
      onChange={(event: ChangeEvent<HTMLInputElement>) => { read(event.target.files?.[0]); event.target.value = ""; }}
      style={{ cursor: "pointer", inset: 0, opacity: 0, position: "absolute", width: "100%" }}
      type="file"
    />
    {value ? <img alt="Vista previa del logo" src={value} style={{ maxHeight: 105, maxWidth: "80%", objectFit: "contain" }} /> : <span style={{ fontSize: 30 }}>▧</span>}
    <strong>{value ? "Cambiar imagen" : "Seleccionar o arrastrar imagen"}</strong>
    <span style={{ color: "#747b85", fontSize: 13 }}>PNG o JPEG · máximo 1 MB</span>
  </div>;
}
