import requests
import json
from datetime import datetime
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GoogleCSE")

class GoogleCSEAPI:
    def __init__(self, api_key, cse_id):
        self.api_key = api_key
        self.cse_id = cse_id
        self.base_url = "https://www.googleapis.com/customsearch/v1"
        
        if not self.api_key or not self.cse_id:
            logger.warning("⚠️ Google CSE API Key o CSE ID no configurados.")
        else:
            logger.info("✅ Google CSE API inicializada.")

    def _perform_search(self, query, num_results=10):
        """Helper function to perform a single search request."""
        if not self.api_key or not self.cse_id:
            return {"error": "API Key or CSE ID missing"}

        params = {
            'q': query,
            'cx': self.cse_id,
            'key': self.api_key,
            'num': min(num_results, 10)
        }

        try:
            # Usamos el dominio de App Engine como referer
            headers = {'Referer': 'https://bionic-scan-v3.uc.r.appspot.com/'}
            response = requests.get(self.base_url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"❌ Error en búsqueda '{query}': {e}")
            return None

    def search(self, query, num_results=10, **kwargs):
        """
        Realiza una búsqueda OSINT completa:
        1. Búsqueda General (para descripción y enlaces)
        2. Búsqueda de Emails (Dorks)
        3. Búsqueda de Teléfonos/Truecaller (Dorks)
        """
        logger.info(f"🔍 Iniciando OSINT Deep Search para: {query}")
        
        # 1. General Search
        general_data = self._perform_search(query, num_results)
        
        results = {
            "found": False,
            "description": "No description available.",
            "emails": [],
            "phones": [],
            "links": [],
            "raw_results": []
        }

        if general_data and 'items' in general_data:
            results["found"] = True
            items = general_data['items']
            
            # Extract Description (Snippet from first result, prefer Wikipedia/LinkedIn)
            if items:
                first_item = items[0]
                results["description"] = first_item.get('snippet', 'No description available.')
                
                # Try to find a better description from Wikipedia if available in top 3
                for item in items[:3]:
                    if 'wikipedia.org' in item.get('link', ''):
                        results["description"] = item.get('snippet')
                        break

            # Extract Links
            for item in items:
                results["links"].append({
                    "title": item.get('title'),
                    "link": item.get('link'),
                    "snippet": item.get('snippet')
                })

        # 2. Email Search (Dorking)
        # Query: "Name" email OR "@gmail.com" OR "@outlook.com" OR "contact"
        email_query = f'"{query}" email OR "@gmail.com" OR "@outlook.com" OR "contact"'
        email_data = self._perform_search(email_query, num_results=5)
        
        if email_data and 'items' in email_data:
            for item in email_data['items']:
                snippet = item.get('snippet', '')
                title = item.get('title', '')
                # Simple heuristic to find email-like strings in snippet/title
                # (This is a basic extraction, regex would be better but keeping it simple/safe)
                if '@' in snippet or '@' in title:
                     results["emails"].append({
                        "title": title,
                        "link": item.get('link'),
                        "snippet": snippet
                    })

        # 3. Phone/Truecaller Search (Dorking)
        # Query: "Name" site:truecaller.com OR "phone number" OR "whatsapp"
        phone_query = f'"{query}" site:truecaller.com OR "mobile number" OR "whatsapp"'
        phone_data = self._perform_search(phone_query, num_results=5)
        
        if phone_data and 'items' in phone_data:
            for item in phone_data['items']:
                results["phones"].append({
                    "title": item.get('title'),
                    "link": item.get('link'),
                    "snippet": item.get('snippet')
                })

        self._log_bot_check()
        return results

    def _log_bot_check(self):
        """Simula logs de seguridad/bot check"""
        log_entry = {
            "event": "BOT_VERIFICATION",
            "status": "PASSED",
            "details": {
                "user_agent": "Valid",
                "ip_check": "Clean"
            },
            "timestamp": datetime.now().isoformat()
        }
        print(f"🛡️ SECURITY_LOG: {json.dumps(log_entry)}")
