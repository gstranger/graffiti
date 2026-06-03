import { useState } from 'react';
import { Graffiti, type Annotation } from 'graffiti';
import 'graffiti/style.css';
import './App.css';

const SAMPLE_VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4';

function App() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  return (
    <div className="app">
      <header>
        <h1>🎨 Graffiti</h1>
        <p>Draw on video. Annotate moments. Make it stick.</p>
      </header>

      <main>
        <Graffiti
          src={SAMPLE_VIDEO}
          width={800}
          height={450}
          onAnnotationAdd={(anno) => {
            setAnnotations((prev) => [...prev, anno]);
            console.log('Annotation added:', anno);
          }}
          onAnnotationRemove={(id) => {
            setAnnotations((prev) => prev.filter((a) => a.id !== id));
            console.log('Annotation removed:', id);
          }}
        />
      </main>

      {annotations.length > 0 && (
        <section className="debug">
          <h2>Annotations ({annotations.length})</h2>
          <pre>{JSON.stringify(annotations, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

export default App;
