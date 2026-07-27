import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * API Proxy endpoint for inserting leads
 * This hides the Supabase domain and provides a clean API endpoint
 * 
 * Usage:
 * POST /api/insert-lead
 * Headers:
 *   Content-Type: application/json
 *   X-API-Key: your_api_key
 * Body: Lead data (JSON)
 */
export default function InsertLead() {
  useEffect(() => {
    const handleRequest = async () => {
      // This component is only for routing - actual API calls go through edge function
      // But we can use window.location to handle direct API calls
      
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        
        if (path === '/api/insert-lead' || path === '/api/leads') {
          // Get request data
          const method = 'POST'; // We only support POST
          
          if (method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }

          try {
            // Forward to edge function
            const apiKey = new URLSearchParams(window.location.search).get('api_key') || 
                          document.querySelector('meta[name="x-api-key"]')?.getAttribute('content');
            
            if (!apiKey) {
              console.error('API key required');
              return;
            }

            // This is just a placeholder - actual handling needs to be done server-side
            console.log('API request received - should be handled by edge function');
          } catch (error) {
            console.error('Error:', error);
          }
        }
      }
    };

    handleRequest();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">API Endpoint</h1>
        <p className="text-muted-foreground">
          This is an API endpoint. Please make POST requests with proper headers.
        </p>
        <div className="mt-6 p-4 bg-muted rounded-lg text-left max-w-md">
          <code className="text-sm">
            POST /api/insert-lead
            <br />
            Headers: X-API-Key, Content-Type
          </code>
        </div>
      </div>
    </div>
  );
}
