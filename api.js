// api.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// Inicialização do Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Configuração do OpenRouter API
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const openRouterBaseURL = 'https://openrouter.ai/api/v1/chat/completions';

//Configuração para os prompts
const preprompt = "You are a computer science professor who analyzes your students' source code looking for code smells, SOLID principle violations, tell dont ask principle violations and demeter law violation, and generates a JSON report marking `true` for the problems identified in the provided snippet and `false` for those not present in the provided snippet. The answer must contain only the JSON object, without any additional text. The JSON object must contain the following keys: 'data_class_smell', 'large_class_smell', 'lazy_class_smell', 'open_close_principle_violation', 'speculative_generality_smell', 'alternative_classes_with_different_interfaces_smell', 'interface_segregation_principle_violation', 'middle_man_smell', 'long_method_smell', 'long_parameter_list_smell', 'switch_statements_smell', 'comments_smell', 'data_clumps_smell', 'dead_code_smell', 'divergent_change_smell', 'primitive_obsession_smell', 'temporary_fields_smell', 'single_responsability_principle_violation', 'parallel_inheritance_hierarchies_smell', 'refused_bequest_smell', 'dependency_inversion_principle_violation', 'liskov_substitution_principle_violation', 'duplicate_code_smell', 'feature_envy_smell', 'inappropriate_intimacy_smell', 'message_chains_smell', 'shotgun_surgery_smell', 'demeter_law_violation', 'tell_dont_ask_principle_violation'. This is the code snippet: ";

// Função para enviar prompt para o modelo GPT-4.1 via OpenRouter
async function queryLLM(prompt, model) {
  try {
    console.log('Enviando prompt para o LLM');
    
    const response = await axios.post(
      openRouterBaseURL,
      {
        model: model,  // ID do modelo no OpenRouter
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao consultar LLM:', error.response?.data || error.message);
    throw new Error(`Erro ao consultar LLM: ${error.message}`);
  }
}

// Função para verificar se o texto contém um JSON válido e extraí-lo
function extractJsonFromText(text) {
  try {
    // Primeiro, tenta ver se o texto completo é um JSON válido
    try {
      const parsedJson = JSON.parse(text);
      return parsedJson;
    } catch (e) {
      // Se não for um JSON válido, tenta encontrar um objeto JSON dentro do texto
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonText = jsonMatch[0];
        const parsedJson = JSON.parse(jsonText);
        return parsedJson;
      }
    }
    
    // Se não encontrou JSON válido, retorna um objeto vazio
    return {};
  } catch (error) {
    console.error('Erro ao extrair JSON da resposta:', error);
    return {};
  }
}

// Endpoint principal para análise de código
app.post('/analyze', async (req, res) => {
  try {
    // Validar que o corpo da requisição contém código
    const code = req.body.code;
    
    if (!code) {
      return res.status(400).json({ 
        error: 'O parâmetro "code" é obrigatório no corpo da requisição' 
      });
    }

    // Enviar o código como prompt para o GPT-4.1
    const llmResponse = await queryLLM(preprompt + code, 'gpt-4.1-turbo');
    
    // Extrair JSON da resposta (ou retornar objeto vazio se não encontrar)
    const extractedJson = extractJsonFromText(llmResponse);
    
    // Verificar se o JSON extraído está vazio
    const isJsonEmpty = Object.keys(extractedJson).length === 0;
    
    // Logs para debug
    console.log('Resposta recebida do LLM');
    console.log(`JSON encontrado: ${!isJsonEmpty ? 'Sim' : 'Não'}`);
    
    // Retornar o resultado
    return res.json({
      success: true,
      result: extractedJson,
      rawResponse: llmResponse,
      containsJson: !isJsonEmpty
    });
    
  } catch (error) {
    console.error('Erro no endpoint /analyze:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rota de status/verificação
app.get('/status', (req, res) => {
  res.json({ status: 'online' });
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`API REST rodando na porta ${PORT}`);
  console.log(`Endpoint de análise disponível em: http://localhost:${PORT}/analyze`);
});