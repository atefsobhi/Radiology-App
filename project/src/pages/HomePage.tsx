import React, { useCallback, useState } from 'react';
import { HomeIcon, Upload, FileSpreadsheet, FileType, AlertCircle } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { read, utils } from 'xlsx';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processTimestamps = (rows: any[]) => {
    // Store the processed data in localStorage for now
    // In a production app, you'd want to use proper state management
    localStorage.setItem('radiology_data', JSON.stringify(rows));
    navigate({ to: '/workflow' });
  };

  const processPdfContent = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textContent: any[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        
        const lines = text.split('\n');
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            const timeMatch = parts.find(part => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(part));
            if (timeMatch) {
              textContent.push({
                Date: parts[0],
                Time: timeMatch,
                'Patient ID': parts[1],
                'Patient Name': parts[2],
                'Mod.': parts[3],
                Description: parts[4],
                Status: parts[5],
              });
            }
          }
        });
      }

      processTimestamps(textContent);
    } catch (err) {
      console.error('Error processing PDF:', err);
      setError('Error processing PDF file. Please check the format and try again.');
    }
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    
    try {
      if (file.name.endsWith('.xlsx')) {
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = utils.sheet_to_json(worksheet);
        processTimestamps(jsonData);
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            processTimestamps(results.data);
          }
        });
      } else if (file.name.endsWith('.pdf')) {
        await processPdfContent(file);
      } else {
        setError('Unsupported file format. Please upload an Excel, CSV, or PDF file.');
      }
    } catch (err) {
      console.error('Error processing file:', err);
      setError('Error processing file. Please check the file format and try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <HomeIcon className="h-12 w-12 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl mb-4">
            RadAnalytics Dashboard
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload your radiology data file to begin analysis
          </p>
        </div>
        
        <div className="mt-12 max-w-xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            )}
            
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {loading ? (
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mb-4 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">Excel, CSV, or PDF files</p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.csv,.pdf"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Supported Formats</h2>
            </div>
            <ul className="space-y-2 text-gray-600">
              <li>• Excel (.xlsx)</li>
              <li>• CSV files (.csv)</li>
              <li>• PDF reports (.pdf)</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <FileType className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Data Requirements</h2>
            </div>
            <ul className="space-y-2 text-gray-600">
              <li>• Patient information</li>
              <li>• Study timestamps</li>
              <li>• Modality details</li>
              <li>• Report status</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <Upload className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Next Steps</h2>
            </div>
            <ol className="space-y-2 text-gray-600 list-decimal list-inside">
              <li>Upload your data file</li>
              <li>Navigate to Workflow or Staff Productivity</li>
              <li>View analytics and reports</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
