import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import DashboardLayout from '@/components/layout/DashboardLayout';
import LargeFileUploadManager from '@/components/uploads/LargeFileUploadManager';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { UploadCloud, FileVideo, HardDrive } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const LargeFileUploadPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Fetch projects for selection
  React.useEffect(() => {
    if (user) {
        supabase.from('projects')
        .select('id, name')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
            if (!error) setProjects(data);
            setLoadingProjects(false);
        });
    }
  }, [user]);

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size < 5 * 1024 * 1024) { // Warn if small file
        toast({
            title: "File too small",
            description: "For files under 5MB, please use the standard uploader.",
            variant: "warning"
        });
    }

    if (file.size > 50 * 1024 * 1024 * 1024) { // 50GB Limit hard cap
        toast({
            title: "File too large",
            description: "Maximum file size is 50GB.",
            variant: "destructive"
        });
        return;
    }

    setSelectedFile(file);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    multiple: false,
    disabled: !!selectedFile
  });

  const handleReset = () => {
    setSelectedFile(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Large File Upload</h1>
            <p className="text-gray-500">
                Optimized for files larger than 500MB. Supports resumable uploads and network loss recovery.
            </p>
        </div>

        {!selectedFile ? (
            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Select Project</CardTitle>
                        <CardDescription>Choose where this file belongs before uploading.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger className="w-full md:w-[300px]">
                                <SelectValue placeholder="Select a project..." />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                <Card className={`border-2 border-dashed transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div {...getRootProps()} className="p-12 flex flex-col items-center justify-center text-center cursor-pointer min-h-[300px]">
                        <input {...getInputProps()} />
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-4">
                            <UploadCloud className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Drag & Drop Large Files Here</h3>
                        <p className="text-sm text-gray-500 max-w-sm mb-4">
                            Supports video, high-res archives, and large datasets. 
                            Files &gt; 500MB recommended.
                        </p>
                        <Button variant="outline" disabled={!selectedProjectId}>
                            {selectedProjectId ? "Browse Files" : "Select Project First"}
                        </Button>
                        {!selectedProjectId && (
                            <p className="text-xs text-red-500 mt-2">Please select a project above to enable upload.</p>
                        )}
                    </div>
                </Card>
            </div>
        ) : (
            <div className="space-y-6">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                                    <FileVideo className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">{selectedFile.name}</CardTitle>
                                    <CardDescription>
                                        {(selectedFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB • {selectedFile.type || 'Unknown Type'}
                                    </CardDescription>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleReset} disabled={false}>Change File</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <LargeFileUploadManager 
                            file={selectedFile} 
                            projectId={selectedProjectId}
                            onComplete={() => toast({ title: "Success", description: "File uploaded successfully" })}
                            onCancel={handleReset}
                        />
                    </CardContent>
                </Card>

                <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-2">
                            <HardDrive className="h-4 w-4" /> Resumable
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Uploads are saved automatically. If you lose connection, just come back here and re-select the file to resume.
                        </p>
                    </div>
                </div>
            </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LargeFileUploadPage;