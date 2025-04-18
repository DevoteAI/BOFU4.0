import { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './lib/supabase';
import { DocumentUploader, ProcessedDocument } from './components/DocumentUploader';
import { BlogLinkInput } from './components/BlogLinkInput';
import { ProductLineInput } from './components/ProductLineInput';
import { SubmitSection } from './components/SubmitSection';
import { Header } from './components/Header';
import { MainHeader } from './components/MainHeader';
import { ProcessingModal } from './components/ProcessingModal';
import ProductResultsPage from './components/ProductResultsPage';
import { ResearchHistory } from './components/ResearchHistory';
import { ResearchResult, getResearchResults, getResearchResultById, deleteResearchResult } from './lib/research';
import { makeWebhookRequest } from './utils/webhookUtils';
import { parseProductData } from './types/product';
import { ProductAnalysis } from './types/product/types';
import { AdminAuthModal } from './components/admin/AdminAuthModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { EmptyHistoryState } from './components/EmptyHistoryState';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthModal } from './components/auth/AuthModal';
import { ScrapedBlog } from './utils/blogScraper';

function App() {
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [blogLinks, setBlogLinks] = useState<string[]>([]);
  const [productLines, setProductLines] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [researchResults, setResearchResults] = useState<ProductAnalysis[]>([]);
  const [historyResults, setHistoryResults] = useState<ResearchResult[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initialize the path-based router state
  // We'll use the path to determine what to show
  const isHomePath = location.pathname === '/';
  const isHistoryPath = location.pathname === '/history';
  const isProductPath = location.pathname.startsWith('/product/');
  const isAdminPath = location.pathname === '/admin';

  // Handle sign out and show auth modal
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Navigate to home
      navigate('/', { replace: true });
      
      // Immediately show auth modal after sign out
      setShowAuthModal(true);
      
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  // Load user on initial render
  useEffect(() => {
    // Check for initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user ?? null);
        
        // Check if admin
        const userData = session.user.user_metadata;
        const isAdmin = userData && (userData.is_admin === true || userData.role === 'admin');
        
        // Update admin auth state
        setIsAdminAuthenticated(isAdmin);
        
        // If admin, redirect to admin page
        if (isAdmin && !isAdminPath) {
          navigate('/admin', { replace: true });
        }
      } else {
        // No active session - show auth modal
        setShowAuthModal(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      // When the event is SIGNED_OUT, show the auth modal
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, redirecting to home and showing auth modal');
        
        // Reset admin authentication state
        setIsAdminAuthenticated(false);
        
        // If not on home page, redirect to home
        if (!isHomePath) {
          navigate('/', { replace: true });
        }
        
        // Show the authentication modal immediately
        setShowAuthModal(true);
        
        return;
      }
      
      if (session) {
        // Check if the user has an admin role in metadata
        const userData = session.user.user_metadata;
        const isAdmin = userData && (userData.is_admin === true || userData.role === 'admin');
        
        console.log(`User logged in. Admin status: ${isAdmin ? 'IS ADMIN' : 'NOT ADMIN'}`);
        
        // If the user is already authenticated as an admin, maintain that state
        if (isAdmin) {
          setIsAdminAuthenticated(true);
          
          // If on admin path, no need to redirect
          if (!isAdminPath) {
            navigate('/admin', { replace: true });
          }
        } else {
          // Regular user logged in - redirect to home if on restricted pages
          if (isAdminPath) {
            navigate('/', { replace: true });
          }
        }
      } else {
        // User signed out but event wasn't SIGNED_OUT
        // Reset admin authentication state
        setIsAdminAuthenticated(false);
        
        // If they were on a restricted page, redirect to home
        if (isAdminPath) {
          navigate('/', { replace: true });
        }
      }
    });

    // Listen for the showAuthModal event from AdminDashboard
    const handleShowAuthModal = () => {
      setShowAuthModal(true);
    };
    
    // Global event for showing the auth modal from anywhere in the app
    window.addEventListener('showAuthModal', handleShowAuthModal);
    
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('showAuthModal', handleShowAuthModal);
    };
  }, []);
  
  // Load history results when the user changes
  useEffect(() => {
    if (user) {
      loadResearchHistory();
    } else {
      setHistoryResults([]);
    }
  }, [user]);
  
  // Load history when navigating to history page
  useEffect(() => {
    if (isHistoryPath && user) {
      loadResearchHistory();
    }
  }, [isHistoryPath, user]);
  
  // Function to load research history
  const loadResearchHistory = useCallback(async () => {
    if (!user) return;
    
    setIsHistoryLoading(true);
    try {
      const results = await getResearchResults();
      console.log(`Loaded ${results.length} research results`);
      setHistoryResults(results);
    } catch (error) {
      console.error('Error loading research history:', error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [user]);
  
  // Handle document processing
  const handleDocumentsProcessed = (processedDocs: ProcessedDocument[]) => {
    setDocuments(processedDocs);
  };

  // Handle blog links input
  const handleBlogLinksChange = (links: string[]) => {
    setBlogLinks(links);
  };

  // Handle product lines input
  const handleProductLinesChange = (productLines: string[]) => {
    setProductLines(productLines);
  };
  
  // Handle research form submission
  const handleSubmit = async () => {
    // Basic validation
    if (productLines.length === 0) {
      alert("Please enter at least one product line");
      return;
    }
    
    if (documents.length === 0 && blogLinks.length === 0) {
      alert("Please upload documents or enter blog links");
      return;
    }

    setIsSubmitting(true);
    setIsProcessing(true);
    
    try {
      // Prepare data for the webhook
      const processedDocuments = documents.map(doc => ({
        name: doc.name,
        content: doc.content,
        type: doc.type
      }));
      
      // Process blog links using OpenAI web search
      let processedBlogs: ScrapedBlog[] = [];
      if (blogLinks.length > 0) {
        try {
          // Import the blog scraper function
          const { scrapeBlogContent } = await import('./utils/blogScraper');
          
          // Process each blog link
          console.log(`Processing ${blogLinks.length} blog links with OpenAI web search...`);
          
          // Process blogs sequentially to avoid rate limits
          for (const url of blogLinks) {
            try {
              const scrapedBlog = await scrapeBlogContent(url);
              processedBlogs.push(scrapedBlog);
              console.log(`Successfully processed blog: ${url}`);
            } catch (error) {
              const blogError = error as Error;
              console.error(`Error processing blog ${url}:`, blogError);
              // Add the URL with error information
              processedBlogs.push({
                url,
                title: url,
                content: `Error processing blog content: ${blogError.message || 'Unknown error'}`,
                status: 'error' as const,
                error: blogError.message || 'Unknown error'
              });
            }
          }
        } catch (error) {
          console.error("Error importing or using blog scraper:", error);
          // Fall back to sending just the URLs if scraping fails
          processedBlogs = blogLinks.map(url => ({
            url,
            title: url,
            content: "URL submitted without processing due to scraper error",
            status: 'error' as const,
            error: "Blog scraping module failed to load"
          }));
        }
      }
      
      const requestPayload = {
        documents: processedDocuments,
        blogs: processedBlogs, // Send processed blog content
        blogLinks, // Also send original links as fallback
        productLines,
        timestamp: new Date().toISOString()
      };

      console.log("Sending research request:", requestPayload);
      
      // Send the data to the webhook
      const webhookResponse = await makeWebhookRequest(
        'https://hook.us2.make.com/dmgxx97dencaquxi9vr9khxrr71kotpm',
        requestPayload,
        {
          timeout: 600000,  // 10 minutes
          maxRetries: 2,
          retryDelay: 5000
        }
      );
      
      console.log("Received webhook response:", webhookResponse);
      
      // Parse the webhook response to extract product data
      const products = parseProductData(webhookResponse);
      
      console.log(`Parsed ${products.length} products:`, products);
      
      if (products && products.length > 0) {
        // Update the research results state
        setResearchResults(products);
        
        // Navigate to the results page
        navigate('/product/new', { replace: true });
      } else {
        throw new Error("Failed to parse product data from response");
      }
    } catch (error) {
      console.error('Error during research submission:', error);
      alert(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
      setIsProcessing(false);
    }
  };
  
  // Reset the research form
  const resetForm = () => {
    setDocuments([]);
    setBlogLinks([]);
    setProductLines([]);
    setCurrentHistoryId(undefined);
  };

  // Handle selecting a history result
  const handleHistorySelect = async (result: ResearchResult) => {
    try {
      console.log(`Selected research history item: ${result.id}`);
      
      // Clean any existing results
      resetForm();
      
      // Set the current history ID
      setCurrentHistoryId(result.id);
      
      // Update the research results state with the selected history item's data
      setResearchResults(result.data);
      
      // Navigate to the product view
      navigate(`/product/${result.id}`, { replace: true });
      
    } catch (error) {
      console.error('Error selecting history item:', error);
    }
  };
  
  // Handle deleting a history result
  const handleHistoryDelete = async (id: string) => {
    try {
      await deleteResearchResult(id);
      
      // If the current history item is deleted, reset the form
      if (id === currentHistoryId) {
        resetForm();
        navigate('/history', { replace: true });
      }
      
      // Refresh the history list
      loadResearchHistory();
    } catch (error) {
      console.error('Error deleting history item:', error);
    }
  };

  // Function to handle loading a product by ID
  const loadProductById = async (id: string) => {
    try {
      const result = await getResearchResultById(id);
      if (result) {
        setResearchResults(result.data);
        setCurrentHistoryId(id);
      } else {
        throw new Error('Research result not found');
      }
    } catch (error) {
      console.error(`Error loading product ${id}:`, error);
      navigate('/history', { replace: true });
    }
  };

  // Check if path has ID parameters to load when component mounts
  useEffect(() => {
    if (isProductPath) {
      const id = location.pathname.split('/product/')[1];
      if (id && id !== 'new') {
        loadProductById(id);
      }
    }
  }, [location.pathname]);

  // Determine what to show based on the current URL path
  const renderMainContent = () => {
    // Admin dashboard
    if (isAdminPath) {
      return isAdminAuthenticated ? (
        <AdminDashboard onLogout={() => setIsAdminAuthenticated(false)} />
      ) : (
        <div className="min-h-screen bg-secondary-900">
          <MainHeader 
            user={user} 
            onShowAuthModal={() => setShowAuthModal(true)} 
            showHistory={isHistoryPath}
            setShowHistory={(show) => {
              if (show) {
                navigate('/history', { replace: true });
              } else {
                navigate('/', { replace: true });
              }
            }}
            onSignOut={handleSignOut}
          />
          <div className="container mx-auto px-4 py-12">
            <div className="max-w-md mx-auto bg-secondary-800 rounded-xl p-8 border-2 border-primary-500/20 shadow-glow">
              <h2 className="text-xl font-semibold text-primary-400 mb-4">Admin Access Required</h2>
              <p className="text-gray-300 mb-6">
                Please log in with an admin account to access the dashboard.
              </p>
              <button
                onClick={() => setShowAdminAuthModal(true)}
                className="w-full px-4 py-2 bg-primary-500 text-black font-medium rounded-lg hover:bg-primary-400 transition-colors"
              >
                Admin Login
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // History view
    if (isHistoryPath) {
      return (
        <div className="min-h-screen bg-gradient-dark bg-circuit-board">
          <MainHeader 
            user={user} 
            onShowAuthModal={() => setShowAuthModal(true)} 
            showHistory={true}
            setShowHistory={(show) => {
              if (!show) {
                navigate('/', { replace: true });
              }
            }}
            onStartNew={() => {
              resetForm();
              navigate('/', { replace: true });
            }}
            onSignOut={handleSignOut}
          />
          
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-primary-400 mb-6">Your Research History</h1>
            
            {!user && (
              <div className="bg-secondary-800 border-2 border-primary-500/20 rounded-xl p-6 mb-8 shadow-glow">
                <p className="text-gray-300 mb-4">
                  Sign in to access your research history.
                </p>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-4 py-2 bg-primary-500 text-black font-medium rounded-lg hover:bg-primary-400 transition-colors"
                >
                  Sign In
                </button>
              </div>
            )}
            
            {user && (
              <ResearchHistory 
                results={historyResults}
                onSelect={handleHistorySelect}
                onDelete={handleHistoryDelete}
                isLoading={isHistoryLoading}
                onStartNew={() => {
                  resetForm();
                  navigate('/', { replace: true });
                }}
              />
            )}
          </div>
        </div>
      );
    }
    
    // Product results page
    if (isProductPath) {
      return researchResults.length > 0 ? (
        <ProductResultsPage 
          products={researchResults}
          onStartNew={() => {
            resetForm();
            navigate('/', { replace: true });
          }}
          existingId={currentHistoryId}
          showHistory={isHistoryPath}
          setShowHistory={(show) => {
            if (show) {
              navigate('/history', { replace: true });
            } else {
              navigate('/', { replace: true });
            }
          }}
          forceHistoryView={() => navigate('/history', { replace: true })}
          onHistorySave={loadResearchHistory}
          onSaveComplete={(newId) => {
            setCurrentHistoryId(newId);
            loadResearchHistory();
          }}
        />
      ) : (
        // If we don't have results but are on a product path, show loading or redirect
        <div className="min-h-screen bg-secondary-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading product data...</p>
          </div>
        </div>
      );
    }
    
    // Home/default view (research form)
    return (
      <div className="min-h-screen bg-secondary-900">
        <MainHeader 
          user={user} 
          onShowAuthModal={() => setShowAuthModal(true)}
          showHistory={false}
          setShowHistory={(show) => {
            if (show) {
              navigate('/history', { replace: true });
            }
          }}
          onSignOut={handleSignOut}
        />
        
        <div className="container mx-auto px-4 py-8">
          <Header />
          
          <div className="max-w-3xl mx-auto space-y-10">
            <DocumentUploader onDocumentsProcessed={handleDocumentsProcessed} />
            <BlogLinkInput onBlogLinksChange={handleBlogLinksChange} />
            <ProductLineInput onProductLinesChange={handleProductLinesChange} />
            <SubmitSection 
              isDisabled={productLines.length === 0 || (documents.length === 0 && blogLinks.length === 0)}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
          },
          success: {
            iconTheme: {
              primary: '#FFE600',
              secondary: '#000',
            },
          },
          error: {
            iconTheme: {
              primary: '#ff4b4b',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={renderMainContent()} />
          <Route path="/history" element={renderMainContent()} />
          <Route path="/product/:id" element={renderMainContent()} />
          <Route path="/admin" element={renderMainContent()} />
        </Routes>
      </AnimatePresence>
      
      {/* Processing Modal */}
      <ProcessingModal isOpen={isProcessing} />
      
      {/* Global Authentication Modal - visible regardless of route */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        onShowAdminLogin={() => setShowAdminAuthModal(true)}
      />
      
      {/* Admin Auth Modal */}
      <AdminAuthModal
        isOpen={showAdminAuthModal}
        onClose={() => setShowAdminAuthModal(false)}
        onAdminAuthenticated={() => {
          setIsAdminAuthenticated(true);
          navigate('/admin', { replace: true });
        }}
      />
    </div>
  );
}

export default App;