// app.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');

// Configurações do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Codebuddy'
};

// Configuração do OpenRouter API
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const openRouterBaseURL = 'https://openrouter.ai/api/v1/chat/completions';

// Configuração dos modelos LLM para testar
const models = [
  {
    id: 'anthropic/claude-3-7-sonnet',
    name: 'claude 3.7 sonnet'
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'gemini 2.0 flash'
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'gpt-4.1'
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'deepseek v3'
  }
];

//Configuração para os prompts
const preprompt = "You are a computer science professor who analyzes your students' source code looking for code smells, SOLID principle violations, tell dont ask principle violations and demeter law violation, and generates a JSON report marking `true` for the problems identified in the provided snippet and `false` for those not present in the provided snippet. The answer must contain only the JSON object, without any additional text. The JSON object must contain the following keys: 'data_class_smell', 'large_class_smell', 'lazy_class_smell', 'open_close_principle_violation', 'speculative_generality_smell', 'alternative_classes_with_different_interfaces_smell', 'interface_segregation_principle_violation', 'middle_man_smell', 'long_method_smell', 'long_parameter_list_smell', 'switch_statements_smell', 'comments_smell', 'data_clumps_smell', 'dead_code_smell', 'divergent_change_smell', 'primitive_obsession_smell', 'temporary_fields_smell', 'single_responsability_principle_violation', 'parallel_inheritance_hierarchies_smell', 'refused_bequest_smell', 'dependency_inversion_principle_violation', 'liskov_substitution_principle_violation', 'duplicate_code_smell', 'feature_envy_smell', 'inappropriate_intimacy_smell', 'message_chains_smell', 'shotgun_surgery_smell', 'demeter_law_violation', 'tell_dont_ask_principle_violation'. This is the code snippet: ";

// Função para conectar ao banco de dados
async function connectToDatabase() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Conectado ao banco de dados MySQL com sucesso!');
    return connection;
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    throw error;
  }
}

// Função para buscar todos os registros da tabela Sources
async function getSources(connection) {
  try {
    const [rows] = await connection.execute('SELECT Id, Code FROM Sources');
    console.log(`Encontrados ${rows.length} registros na tabela Sources`);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar registros da tabela Sources:', error);
    throw error;
  }
}

// Função para enviar prompt para modelo LLM via OpenRouter
async function queryLLM(prompt, model) {
  try {
    console.log(`Enviando prompt para ${model.name}...`);
    
    const response = await axios.post(
      openRouterBaseURL,
      {
        model: model.id,
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
    console.error(`Erro ao consultar ${model.name}:`, error.response?.data || error.message);
    return `Erro: ${error.message}`;
  }
}

// Função para extrair os valores de code smells do JSON retornado pelo LLM
function extractCodeSmellsFromResponse(responseText) {
  // Lista de todos os code smells e princípios que estamos monitorando
  const allCodeSmells = [
    'data_class_smell',
    'large_class_smell',
    'lazy_class_smell',
    'open_close_principle_violation',
    'speculative_generality_smell',
    'alternative_classes_with_different_interfaces_smell',
    'interface_segregation_principle_violation',
    'middle_man_smell',
    'long_method_smell',
    'long_parameter_list_smell',
    'switch_statements_smell',
    'comments_smell',
    'data_clumps_smell',
    'dead_code_smell',
    'divergent_change_smell',
    'primitive_obsession_smell',
    'temporary_fields_smell',
    'single_responsability_principle_violation',
    'parallel_inheritance_hierarchies_smell',
    'refused_bequest_smell',
    'dependency_inversion_principle_violation',
    'liskov_substitution_principle_violation',
    'duplicate_code_smell',
    'feature_envy_smell',
    'inappropriate_intimacy_smell',
    'message_chains_smell',
    'shotgun_surgery_smell',
    'demeter_law_violation',
    'tell_dont_ask_principle_violation'
  ];
  
  // Inicializa um objeto com todos os code smells como false
  const codeSmells = {};
  allCodeSmells.forEach(smell => {
    codeSmells[smell] = false;
  });
  
  try {
    // Tenta encontrar um objeto JSON na resposta
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      // Parseia o JSON encontrado
      const jsonData = JSON.parse(jsonMatch[0]);
      
      // Atualiza os valores dos code smells com base no JSON
      allCodeSmells.forEach(smell => {
        if (jsonData[smell] !== undefined) {
          codeSmells[smell] = jsonData[smell];
        }
      });
    }
  } catch (error) {
    console.error('Erro ao extrair code smells do JSON:', error);
    // Em caso de erro, mantém todos os valores como false (já inicializados)
  }
  
  return codeSmells;
}

// Função para salvar resposta no banco de dados
async function saveResponse(connection, sourceId, llmName, prompt, response) {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Extrair os code smells da resposta
    const codeSmells = extractCodeSmellsFromResponse(response);
    
    // Construir as colunas e valores para o SQL dinâmico
    const columns = ['SourceId', 'LLM', 'Prompt', 'Response', 'Timestamp'];
    const placeholders = ['?', '?', '?', '?', '?'];
    const values = [sourceId, llmName, prompt, response, timestamp];
    
    // Adicionar cada code smell como uma coluna e valor
    Object.entries(codeSmells).forEach(([smell, value]) => {
      columns.push(smell);
      placeholders.push('?');
      values.push(value);
    });
    
    // Construir a query SQL dinâmica
    const query = `
      INSERT INTO Responses (${columns.join(', ')}) 
      VALUES (${placeholders.join(', ')})
    `;
    
    await connection.execute(query, values);
    console.log(`Resposta do modelo ${llmName} para o sourceId ${sourceId} salva com sucesso!`);
  } catch (error) {
    console.error('Erro ao salvar resposta:', error);
    throw error;
  }
}

// Função principal
async function main() {
  let connection;
  
  try {
    // Conectar ao banco de dados
    connection = await connectToDatabase();
    
    // Buscar todos os registros da tabela Sources
    const sources = await getSources(connection);
    
    // Para cada registro, consultar todos os modelos LLM
    for (const source of sources) {
      const prompt = preprompt + source.Code;
      console.log(`\nProcessando Source ID: ${source.Id}`);
      
      // Consultar cada modelo LLM
      for (const model of models) {
        console.log(`- Consultando ${model.name}...`);
        const response = await queryLLM(prompt, model);
        
        // Mostrar no console se um JSON foi encontrado
        const hasJson = response.includes('{') && response.includes('}');
        console.log(`  - JSON encontrado na resposta: ${hasJson ? 'Sim' : 'Não'}`);
        
        // Salvar resposta no banco de dados
        await saveResponse(connection, source.Id, model.name, prompt, response);
      }
    }
    
    console.log('\nTodas as consultas foram concluídas com sucesso!');
  } catch (error) {
    console.error('Erro durante a execução:', error);
  } finally {
    // Fechar conexão com o banco de dados
    if (connection) {
      await connection.end();
      console.log('Conexão com o banco de dados fechada.');
    }
  }
}

// Iniciar o programa
main();