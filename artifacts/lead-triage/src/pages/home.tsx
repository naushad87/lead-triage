import { useState } from "react";
import { useTriageMessages } from "@workspace/api-client-react";
import { Loader2, Copy, CheckCircle2, AlertTriangle, ArrowRight, Zap, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const DEFAULT_MESSAGES = [
  "yo i need to upgrade my plan asap we just hit the limit and everything is blocked call me back",
  "hey just checking on pricing for enterprise tier",
  "can u integrate with salesforce? we are evaluating tools rn",
  "idk if this works for us, is there a free trial",
  "my boss wants a demo tmrw 10am pst is that possible???"
];

export default function Home() {
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const triageMutation = useTriageMessages();
  const results = triageMutation.data?.results;

  const handleMessageChange = (index: number, value: string) => {
    const newMessages = [...messages];
    newMessages[index] = value;
    setMessages(newMessages);
  };

  const handleTriage = () => {
    if (messages.filter(m => m.trim().length > 0).length === 0) {
      toast({
        title: "No messages",
        description: "Please enter at least one message to triage.",
        variant: "destructive",
      });
      return;
    }
    triageMutation.mutate({ data: { messages: messages.filter(m => m.trim().length > 0) } });
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Draft reply copied.",
    });
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "high": return "bg-destructive text-destructive-foreground border-destructive";
      case "medium": return "bg-accent text-accent-foreground border-accent";
      case "low": return "bg-secondary text-secondary-foreground border-secondary";
      default: return "bg-secondary text-secondary-foreground border-secondary";
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col p-4 md:p-8 max-w-4xl mx-auto selection:bg-primary/30">
      
      <header className="mb-8 flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight uppercase flex items-center gap-2">
            <Inbox className="w-8 h-8 text-primary" />
            INBOX_TRIAGE
          </h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">OPERATIONAL LEAD PROCESSOR v1.0</p>
        </div>
        <Button 
          onClick={handleTriage} 
          disabled={triageMutation.isPending}
          size="lg"
          className="font-bold tracking-wide shadow-[0_0_15px_rgba(0,123,255,0.3)] hover:shadow-[0_0_25px_rgba(0,123,255,0.5)] transition-all"
        >
          {triageMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> PROCESSING...</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" /> TRIAGE ALL</>
          )}
        </Button>
      </header>

      <div className="flex-1 flex flex-col gap-6">
        {messages.map((message, index) => {
          const result = results?.[index];
          const isProcessing = triageMutation.isPending;

          return (
            <div key={index} className="flex flex-col gap-3">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 border border-border">
                  <span className="text-xs font-mono text-muted-foreground">{index + 1}</span>
                </div>
                <div className="flex-1 flex flex-col gap-2 relative">
                  
                  {/* Chat Bubble Input */}
                  <div className="relative group">
                    <div className="absolute -left-2 top-4 w-4 h-4 bg-card border-l border-t border-card-border rotate-[-45deg] z-0" />
                    <Textarea
                      value={message}
                      onChange={(e) => handleMessageChange(index, e.target.value)}
                      placeholder="Paste inbound message here..."
                      className="resize-none min-h-[80px] bg-card border-card-border shadow-sm rounded-2xl rounded-tl-sm text-base p-4 relative z-10 focus-visible:ring-primary focus-visible:border-primary placeholder:text-muted-foreground/50 transition-colors"
                      data-testid={`input-message-${index}`}
                    />
                  </div>

                  {/* Processing State */}
                  {isProcessing && (
                    <div className="pl-6 pt-2">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="font-mono text-xs uppercase tracking-wider animate-pulse">Analyzing intent...</span>
                      </div>
                      <Skeleton className="h-[120px] w-full mt-3 rounded-lg bg-card/50" />
                    </div>
                  )}

                  {/* Result State */}
                  {result && !isProcessing && (
                    <Card className="ml-6 mt-2 border border-primary/20 bg-primary/5 rounded-xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,123,255,0.1)] transition-all animate-in slide-in-from-top-2 duration-300">
                      <div className="p-4 flex flex-col gap-4">
                        
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="outline" className="font-mono bg-background/50 border-primary/30 text-primary">
                            {result.leadCategory}
                          </Badge>
                          <Badge variant="outline" className={`font-mono font-bold border-transparent ${getUrgencyColor(result.urgency)}`}>
                            {result.urgency === 'high' && <AlertTriangle className="w-3 h-3 mr-1 inline-block" />}
                            {result.urgency.toUpperCase()} URGENCY
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" /> Next Action
                            </span>
                            <div className="text-sm bg-background/50 p-3 rounded-md border border-border font-medium">
                              {result.nextAction}
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 relative">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                              Draft Reply
                            </span>
                            <div className="text-sm bg-background/50 p-3 rounded-md border border-border text-muted-foreground italic relative pr-10 min-h-[44px]">
                              "{result.draftReply}"
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-1 top-1 h-8 w-8 hover:bg-primary/20 hover:text-primary transition-colors"
                                onClick={() => copyToClipboard(result.draftReply, index)}
                                title="Copy reply"
                              >
                                {copiedIndex === index ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                      </div>
                    </Card>
                  )}
                  
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
