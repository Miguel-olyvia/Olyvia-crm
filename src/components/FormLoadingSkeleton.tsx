import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FormLoadingSkeletonProps {
  primaryColor?: string;
  backgroundColor?: string;
  cardStyle?: React.CSSProperties;
  loadingText?: string;
}

export const FormLoadingSkeleton = ({ 
  primaryColor = "#85D3BE",
  backgroundColor,
  cardStyle,
  loadingText = "A preparar o formulário..."
}: FormLoadingSkeletonProps) => {
  // Detect if we're in an iframe
  const isInIframe = typeof window !== 'undefined' && window !== window.parent;
  
  return (
    <div 
      className={`${isInIframe ? 'min-h-fit' : 'min-h-screen'} flex items-center justify-center p-4`}
      style={{ backgroundColor: backgroundColor || 'hsl(var(--background))' }}
    >
      <motion.div 
        className="w-full max-w-2xl mx-auto"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Card 
          className="overflow-hidden shadow-lg"
          style={cardStyle}
        >
          <CardHeader className="pb-4 sm:pb-6 px-4 sm:px-6">
            {/* Step counter skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0 }}
            >
              <Skeleton className="h-4 w-24 mb-4" />
            </motion.div>

            {/* Logo skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <motion.div 
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Skeleton className="h-10 w-32 mb-4" />
              </motion.div>
            </motion.div>

            {/* Title skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <motion.div 
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Skeleton className="h-8 sm:h-10 w-3/4 mb-2" />
              </motion.div>
            </motion.div>

            {/* Subtitle skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Skeleton className="h-4 w-1/2 mb-4" />
            </motion.div>

            {/* Progress bar skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex gap-2 mt-4"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: i === 0 ? primaryColor : 'hsl(var(--muted))' }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                />
              ))}
            </motion.div>
          </CardHeader>

          <CardContent className="pt-0 px-4 sm:px-6 pb-6">
            {/* Field skeletons */}
            <div className="space-y-6">
              {/* Card options skeleton */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <Skeleton className="h-4 w-40 mb-3" />
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
                    >
                      <motion.div
                        animate={{ opacity: [0.4, 0.7, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="border-2 rounded-2xl p-4"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <Skeleton className="h-12 w-12 rounded-xl mb-3" />
                        <Skeleton className="h-4 w-20" />
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Input field skeleton */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <Skeleton className="h-4 w-28 mb-2" />
                <motion.div 
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Skeleton className="h-12 w-full rounded-xl" />
                </motion.div>
              </motion.div>

              {/* Another input skeleton */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                <Skeleton className="h-4 w-36 mb-2" />
                <motion.div 
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Skeleton className="h-12 w-full rounded-xl" />
                </motion.div>
              </motion.div>
            </div>

            {/* Button skeleton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="mt-8"
            >
              <motion.div
                className="h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-white/80"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ 
                        duration: 0.6, 
                        repeat: Infinity, 
                        delay: i * 0.15,
                        ease: "easeInOut"
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>

            {/* Loading text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="text-center text-sm text-muted-foreground mt-4"
            >
              {loadingText}
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default FormLoadingSkeleton;
