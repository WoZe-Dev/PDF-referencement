import { useState } from 'react';
import { FileText, Download, Search, CheckCircle, AlertCircle, Trash2, Plus } from 'lucide-react';
import ImageUploader from './components/ImageUploader';
import ProductsList from './components/ProductsList';
import { Product } from './lib/types';

interface ImageData {
  id: string;
  base64: string;
  references: string[];
  products: Product[];
  status: 'processing' | 'ready' | 'error';
  error?: string;
}

function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showUploader, setShowUploader] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const handleImageSelected = async (file: File, base64: string) => {
    const imageId = `img-${Date.now()}`;

    const newImage: ImageData = {
      id: imageId,
      base64,
      references: [],
      products: [],
      status: 'processing',
    };

    setImages(prev => [...prev, newImage]);
    setShowUploader(false);

    try {
      const extractResponse = await fetch(
        `${API_URL}/functions/v1/extract-references`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageBase64: base64.split(',')[1],
          }),
        }
      );

      if (!extractResponse.ok) {
        throw new Error('Erreur lors de l\'extraction des références');
      }

      const extractData = await extractResponse.json();

      if (!extractData.success || extractData.references.length === 0) {
        setImages(prev => prev.map(img =>
          img.id === imageId
            ? { ...img, status: 'error', error: 'Aucune référence ART trouvée' }
            : img
        ));
        return;
      }

      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, references: extractData.references }
          : img
      ));

      const fetchResponse = await fetch(
        `${API_URL}/functions/v1/fetch-skyper-products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            references: extractData.references,
          }),
        }
      );

      if (!fetchResponse.ok) {
        throw new Error('Erreur lors de la récupération des produits');
      }

      const fetchData = await fetchResponse.json();

      if (!fetchData.success || fetchData.products.length === 0) {
        setImages(prev => prev.map(img =>
          img.id === imageId
            ? { ...img, status: 'error', error: 'Aucun produit trouvé' }
            : img
        ));
        return;
      }

      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, products: fetchData.products, status: 'ready' }
          : img
      ));
    } catch (error) {
      console.error('Error:', error);
      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, status: 'error', error: error instanceof Error ? error.message : 'Une erreur est survenue' }
          : img
      ));
    }
  };

  const handleRemoveImage = (imageId: string) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);

    try {
      const allProducts = images.flatMap(img => img.products);

      const response = await fetch(
        `${API_URL}/functions/v1/generate-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            products: allProducts,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la génération du PDF');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Erreur lors de la génération du PDF');
      }

      const link = document.createElement('a');
      link.href = data.pdf;
      link.download = `produits-${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la génération du PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const allProducts = images.flatMap(img => img.products);
  const hasReadyImages = images.some(img => img.status === 'ready');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Extracteur de Références
          </h1>
          <p className="text-gray-600 text-lg">
            Ajoutez plusieurs images pour extraire les références ART et générer un PDF
          </p>
        </header>

        <div className="space-y-6">
          {showUploader ? (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Ajouter une image
              </h2>
              <ImageUploader
                onImageSelected={handleImageSelected}
                isProcessing={false}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowUploader(true)}
              className="w-full bg-white rounded-xl shadow-sm p-6 hover:bg-gray-50 transition-colors border-2 border-dashed border-gray-300 hover:border-blue-400"
            >
              <div className="flex items-center justify-center gap-3 text-blue-600">
                <Plus className="w-6 h-6" />
                <span className="font-semibold text-lg">Ajouter une autre image</span>
              </div>
            </button>
          )}

          {images.map((image) => (
            <div key={image.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-6">
                  <img
                    src={image.base64}
                    alt="Uploaded"
                    className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {image.status === 'processing' && (
                          <>
                            <Search className="w-5 h-5 text-blue-500 animate-spin" />
                            <span className="text-blue-700 font-medium">Analyse en cours...</span>
                          </>
                        )}
                        {image.status === 'ready' && (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            <span className="text-green-700 font-medium">Analyse terminée</span>
                          </>
                        )}
                        {image.status === 'error' && (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <span className="text-red-700 font-medium">{image.error}</span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveImage(image.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer cette image"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    {image.references.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">
                          Références trouvées ({image.references.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {image.references.map((ref) => (
                            <span
                              key={ref}
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                            >
                              {ref}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {image.products.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">
                          Produits trouvés ({image.products.length})
                        </h3>
                        <ProductsList products={image.products} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {hasReadyImages && (
            <div className="sticky bottom-6 flex justify-center">
              <button
                onClick={handleGeneratePDF}
                disabled={isGeneratingPDF}
                className="flex items-center gap-3 px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-6 h-6" />
                {isGeneratingPDF ? 'Génération du PDF...' : `Générer PDF (${allProducts.length} produits)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
