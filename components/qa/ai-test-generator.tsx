"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import type { GeneratedTest } from '@/types';
import { cn } from '@/lib/utils';

interface AITestGeneratorProps {
  websiteUrl: string;
  aiModel: string;
  onAddTests: (tests: GeneratedTest[]) => void;
}

export function AITestGenerator({ websiteUrl, aiModel, onAddTests }: AITestGeneratorProps) {
  const [rawText, setRawText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTests, setGeneratedTests] = useState<GeneratedTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!rawText.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedTests([]);
    setSelectedTests(new Set());

    try {
      const response = await fetch('/api/generate-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          websiteUrl,
          aiModel,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate tests');
      }

      const data = await response.json();

      if (data.tests && data.tests.length > 0) {
        setGeneratedTests(data.tests);
        // Select all by default
        setSelectedTests(new Set(data.tests.map((_: GeneratedTest, i: number) => i)));
      } else {
        setError('No tests were generated. Try providing more details.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTest = (index: number) => {
    const newSelected = new Set(selectedTests);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTests(newSelected);
  };

  const selectAll = () => {
    setSelectedTests(new Set(generatedTests.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedTests(new Set());
  };

  const handleAddSelected = () => {
    const testsToAdd = generatedTests.filter((_, i) => selectedTests.has(i));
    if (testsToAdd.length > 0) {
      onAddTests(testsToAdd);
      // Reset state
      setGeneratedTests([]);
      setSelectedTests(new Set());
      setRawText('');
    }
  };

  const removeTest = (index: number) => {
    setGeneratedTests((prev) => prev.filter((_, i) => i !== index));
    const newSelected = new Set(selectedTests);
    newSelected.delete(index);
    // Adjust indices for items after the removed one
    const adjusted = new Set<number>();
    newSelected.forEach((i) => {
      if (i > index) {
        adjusted.add(i - 1);
      } else {
        adjusted.add(i);
      }
    });
    setSelectedTests(adjusted);
  };

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Test Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Paste your requirements, user stories, feature descriptions, or any text.
            AI will analyze it and generate test cases automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={`Paste your text here. Examples:\n\n• Feature requirements or user stories\n• Bug descriptions to create regression tests\n• Workflow descriptions\n• API documentation\n• Or just describe what you want to test...`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="resize-none font-mono text-xs leading-relaxed"
          />

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!rawText.trim() || isGenerating}
              size="sm"
              className="h-8 text-xs"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate Test Cases
                </>
              )}
            </Button>

            {error && (
              <span className="text-xs text-[#e5484d]">{error}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generated Tests Section */}
      {generatedTests.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight">Generated Test Cases</CardTitle>
                <CardDescription className="text-xs">
                  Review and select the tests you want to add.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-[11px] font-medium px-1.5 py-0">
                {selectedTests.size} of {generatedTests.length} selected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Selection controls */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectNone}>
                Select None
              </Button>
            </div>

            {/* Test list */}
            <div className="space-y-1.5">
              {generatedTests.map((test, index) => (
                <div
                  key={index}
                  className={cn(
                    'p-3 rounded-md border transition-colors duration-100',
                    selectedTests.has(index)
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-transparent border-border/40'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      checked={selectedTests.has(index)}
                      onCheckedChange={() => toggleTest(index)}
                      className="mt-0.5"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-sm font-medium">{test.title}</span>

                      <p className="text-xs text-muted-foreground">
                        {test.description}
                      </p>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground/60">Expected:</span>
                        <span className="text-[#30a46c]/80">{test.expectedOutcome}</span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-[#e5484d]"
                      onClick={() => removeTest(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add button */}
            <div className="flex justify-end pt-3 border-t border-border/30">
              <Button
                onClick={handleAddSelected}
                disabled={selectedTests.size === 0}
                size="sm"
                className="h-8 text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add {selectedTests.size} Test{selectedTests.size !== 1 ? 's' : ''} to Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success state placeholder for when tests are added */}
      {generatedTests.length === 0 && rawText === '' && (
        <Card className="border-dashed border-border/30">
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/20 mb-3" />
            <p className="text-xs text-muted-foreground">
              Paste your requirements above to generate test cases
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
