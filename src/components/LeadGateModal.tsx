"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, Mail, User, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

export function LeadGateModal({ reportId, onUnlock }: { reportId: string, onUnlock: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, reportId }),
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        onUnlock();
      } else {
        throw new Error(data.error || "An error occurred");
      }
    } catch (error: any) {
      toast(error.message, "error");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative glass-card border border-primary/20 w-full max-w-md p-8 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-indigo-400" />
          
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Get a personalized plan to outrank competitors</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Enter your details to see precisely how many customers you're losing and the exact steps to win them back.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                required 
                placeholder="Full Name" 
                className="pl-9 bg-white/5"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                required 
                type="email"
                placeholder="Email Address" 
                className="pl-9 bg-white/5"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Phone Number (Optional)" 
                className="pl-9 bg-white/5"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full mt-6"
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Get My Growth Plan
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Your information is secure. We won't spam you.
            </p>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
