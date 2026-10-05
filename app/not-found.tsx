export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "20vh auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", color: "#071B33" }}>
      <h1 style={{ fontSize: 28, margin: 0 }}>Page introuvable</h1>
      <p style={{ color: "#55667D" }}>Cette adresse n'existe pas. <a href="/" style={{ color: "#0B2D5B", fontWeight: 600 }}>Retour à l'accueil</a></p>
    </main>
  );
}
